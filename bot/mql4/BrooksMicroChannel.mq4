//+------------------------------------------------------------------+
//|                                          BrooksMicroChannel.mq4  |
//|  Al Brooks micro-channel: trend continuation after the first     |
//|  pullback. MQL4 port of brooks_microchannel_bot.py               |
//|                                                                  |
//|  v1.11                                                           |
//|   - optional signal publishing to the website (SignalPublisher.  |
//|     mqh). Read-only: trading logic is unchanged.                 |
//|                                                                  |
//|  v1.10                                                           |
//|   - signal timeframe is fixed by the SignalTF input (M5), so     |
//|     changing the chart timeframe no longer changes the strategy  |
//|   - status panel on the chart (top-left corner)                  |
//|   - optional alert when an order is placed                       |
//|   - equity baseline is not stored while the account is offline   |
//|                                                                  |
//|  Attach to one chart of each symbol you want to trade            |
//|  (XAUUSD, EURUSD, US30). Use the same Magic on all charts so     |
//|  the MaxOpen limit is counted across symbols.                    |
//|  TEST ON A DEMO ACCOUNT FIRST.                                   |
//+------------------------------------------------------------------+
#property copyright "Brooks Micro-Channel EA"
#property version   "1.11"

#include "SignalPublisher.mqh"
#property strict

//--- signal
input ENUM_TIMEFRAMES SignalTF     = PERIOD_M5; // Timeframe used for signals (independent of the chart)
input int    MinBars               = 5;     // Min bars in the micro channel (>=3)
input double BullRatio             = 0.7;   // Min share of trend bars in the channel
input double MinMoveATR            = 1.2;   // Min channel move, in ATR
input int    ATRPeriod             = 14;
input int    EMAPeriod             = 20;
input double RR                    = 1.0;   // Reward : risk
input double BufferATR             = 0.05;  // Entry/stop buffer, in ATR
input double MinRiskATR            = 0.3;   // Min stop distance, in ATR
input double MaxRiskATR            = 2.0;   // Max stop distance, in ATR
//--- risk
input double RiskPct               = 0.5;   // Risk per trade, % of equity
input double MaxDailyLossPct       = 2.0;   // Stop new trades after this daily loss %
input double MaxMonthlyDDPct       = 8.0;   // Stop new trades after this monthly loss %
input int    MaxOpen               = 2;     // Max open positions (all symbols, this Magic)
//--- filters
input int    MaxSpreadPoints       = 0;     // Max spread in points (0 = auto: XAU 40, EURUSD 15, US30 400)
input int    SessionStartUTC       = 7;     // Trading window start hour (UTC)
input int    SessionEndUTC         = 20;    // Trading window end hour (UTC)
input string NewsBlackoutsUTC      = "";    // e.g. 2026.10.07 12:20-2026.10.07 13:10;2026.10.08 12:20-2026.10.08 13:10
input int    TesterServerGMTOffset = 3;     // Strategy Tester only: broker server GMT offset (hours)
//--- misc
input int    Magic                 = 55501;
input string KillFile              = "STOP.txt"; // Create this file in MQL4\Files to stop new orders
input int    Slippage              = 10;
input bool   AlertOnOrder          = true;  // Popup + sound when an order is placed
input bool   ShowPanel             = true;  // Show status text on the chart
//--- website publishing (does not affect trading)
input bool   PublishSignals        = false; // Send signals/results to the website
input string PublishConfigFile     = "signal_publisher.cfg"; // In MQL4\Files: url=, key=, secret=

datetime g_lastBar = 0;
string   g_last    = "waiting for the next bar";

//+------------------------------------------------------------------+
int OnInit()
{
   if(MinBars < 3)
   {
      Alert("BrooksMicroChannel: MinBars must be >= 3");
      return(INIT_PARAMETERS_INCORRECT);
   }
   if(MaxSpreadLimit() <= 0)
      Alert("BrooksMicroChannel: unknown symbol ", Symbol(), " - set MaxSpreadPoints manually, no trades until then");

   if(PublishSignals) PubInit(PublishConfigFile);

   g_lastBar = iTime(NULL, SignalTF, 0);   // wait for the next new bar before the first check
   g_last    = "waiting for the next bar";
   ShowStatus();
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   Comment("");
}

//+------------------------------------------------------------------+
void OnTick()
{
   UpdateBaselines();

   datetime t0 = iTime(NULL, SignalTF, 0);
   if(t0 > 0 && t0 != g_lastBar)
   {
      g_lastBar = t0;
      OnNewBar();
   }
   ShowStatus();
   if(PublishSignals) PubTick(Magic, SignalTF);   // after trading logic; only reads orders
}

void OnNewBar()
{
   string stamp = TimeToString(TimeCurrent(), TIME_MINUTES) + " ";
   string why   = "";

   CancelPending();                      // previous pending order is valid for one bar only

   int    side  = -1;
   double entry = 0, sl = 0, tp = 0;
   if(!GetSignal(side, entry, sl, tp)) { g_last = stamp + "no pattern";          return; }
   if(!RiskOK(why))                    { g_last = stamp + "signal blocked: " + why; return; }
   if(!FiltersOK(why))                 { g_last = stamp + "signal blocked: " + why; return; }
   g_last = stamp + Place(side, entry, sl, tp);
}

//+------------------------------------------------------------------+
//| Price series on the signal timeframe                             |
//+------------------------------------------------------------------+
double O(int k) { return(iOpen(NULL,  SignalTF, k)); }
double H(int k) { return(iHigh(NULL,  SignalTF, k)); }
double L(int k) { return(iLow(NULL,   SignalTF, k)); }
double C(int k) { return(iClose(NULL, SignalTF, k)); }

string TFName(int tf)
{
   switch(tf)
   {
      case PERIOD_M1:  return("M1");
      case PERIOD_M5:  return("M5");
      case PERIOD_M15: return("M15");
      case PERIOD_M30: return("M30");
      case PERIOD_H1:  return("H1");
      case PERIOD_H4:  return("H4");
      case PERIOD_D1:  return("D1");
      case PERIOD_W1:  return("W1");
      case PERIOD_MN1: return("MN");
   }
   return("chart TF");
}

//+------------------------------------------------------------------+
//| Time in UTC (tester has no real GMT, so use the offset input)    |
//+------------------------------------------------------------------+
datetime NowUTC()
{
   if(IsTesting()) return((datetime)(TimeCurrent() - TesterServerGMTOffset * 3600));
   return(TimeGMT());
}

//+------------------------------------------------------------------+
//| Signal on closed bars. Bar 1 = pullback, bars 2..n+1 = channel   |
//+------------------------------------------------------------------+
bool GetSignal(int &side, double &entry, double &sl, double &tp)
{
   int n = MinBars;
   if(iBars(NULL, SignalTF) < MathMax(ATRPeriod, EMAPeriod) + n + 6) return(false);

   double a = iATR(NULL, SignalTF, ATRPeriod, 1);
   if(a <= 0) return(false);
   double ema = iMA(NULL, SignalTF, EMAPeriod, 0, MODE_EMA, PRICE_CLOSE, 1);
   double buf = BufferATR * a;

   int newest = 2, oldest = n + 1;
   bool lowsOk = true, highsOk = true;
   int  bulls = 0, bears = 0;
   for(int k = newest; k <= oldest; k++)
   {
      if(C(k) > O(k)) bulls++;
      if(C(k) < O(k)) bears++;
      if(k < oldest)
      {
         if(L(k) < L(k + 1)) lowsOk  = false;   // every low must be >= previous low
         if(H(k) > H(k + 1)) highsOk = false;   // every high must be <= previous high
      }
   }
   double eps = 1e-9;
   double r;

   //--- bull micro channel
   double move    = C(newest) - O(oldest);
   bool   pull    = (L(1) < L(newest)) || (C(1) < O(1));
   bool   shallow = (L(1) > L(newest + 2));
   if(lowsOk && (double)bulls / n >= BullRatio - eps && move >= MinMoveATR * a
      && pull && shallow && C(1) > ema)
   {
      entry = H(1) + buf;
      sl    = L(1) - buf;
      r     = entry - sl;
      if(r >= MinRiskATR * a && r <= MaxRiskATR * a)
      {
         side = OP_BUYSTOP;
         tp   = entry + RR * r;
         return(true);
      }
   }

   //--- bear micro channel
   move    = O(oldest) - C(newest);
   pull    = (H(1) > H(newest)) || (C(1) > O(1));
   shallow = (H(1) < H(newest + 2));
   if(highsOk && (double)bears / n >= BullRatio - eps && move >= MinMoveATR * a
      && pull && shallow && C(1) < ema)
   {
      entry = L(1) - buf;
      sl    = H(1) + buf;
      r     = sl - entry;
      if(r >= MinRiskATR * a && r <= MaxRiskATR * a)
      {
         side = OP_SELLSTOP;
         tp   = entry - RR * r;
         return(true);
      }
   }
   return(false);
}

//+------------------------------------------------------------------+
//| Day / month starting equity, stored in terminal global variables |
//+------------------------------------------------------------------+
string GV(string name)
{
   return("BMC_" + IntegerToString(AccountNumber()) + "_" + IntegerToString(Magic) + "_" + name);
}

void UpdateBaselines()
{
   double eq = AccountEquity();
   if(eq <= 0) return;                    // not connected yet - do not store a zero baseline

   datetime now = NowUTC();
   double   day = TimeYear(now) * 10000 + TimeMonth(now) * 100 + TimeDay(now);
   double   mon = TimeYear(now) * 100 + TimeMonth(now);

   if(!GlobalVariableCheck(GV("day")) || GlobalVariableGet(GV("day")) != day
      || GlobalVariableGet(GV("day_eq")) <= 0)
   {
      GlobalVariableSet(GV("day"), day);
      GlobalVariableSet(GV("day_eq"), eq);
   }
   if(!GlobalVariableCheck(GV("mon")) || GlobalVariableGet(GV("mon")) != mon
      || GlobalVariableGet(GV("mon_eq")) <= 0)
   {
      GlobalVariableSet(GV("mon"), mon);
      GlobalVariableSet(GV("mon_eq"), eq);
   }
}

double LossPct(string baselineName)
{
   double base = GlobalVariableGet(GV(baselineName));
   if(base <= 0) return(0);
   return((base - AccountEquity()) / base * 100.0);
}

bool RiskOK(string &why)
{
   if(FileIsExist(KillFile))               { why = "kill file found";             return(false); }
   if(LossPct("day_eq") >= MaxDailyLossPct) { why = "daily loss limit reached";    return(false); }
   if(LossPct("mon_eq") >= MaxMonthlyDDPct) { why = "monthly loss limit reached";  return(false); }
   return(true);
}

//+------------------------------------------------------------------+
//| Session, news, spread, open-position filters                     |
//+------------------------------------------------------------------+
int MaxSpreadLimit()
{
   if(MaxSpreadPoints > 0) return(MaxSpreadPoints);
   string s = Symbol();
   if(StringFind(s, "XAU") >= 0)    return(40);
   if(StringFind(s, "EURUSD") >= 0) return(15);
   if(StringFind(s, "US30") >= 0)   return(400);
   return(0);
}

bool InSession(datetime now)
{
   int hour = TimeHour(now);
   int dow  = TimeDayOfWeek(now);              // 0 = Sunday, 6 = Saturday
   if(hour < SessionStartUTC || hour >= SessionEndUTC) return(false);
   if(dow == 0 || dow == 6) return(false);
   return(true);
}

bool InNewsBlackout(datetime now)
{
   if(StringLen(NewsBlackoutsUTC) == 0) return(false);
   string windows[];
   int cnt = StringSplit(NewsBlackoutsUTC, ';', windows);
   for(int i = 0; i < cnt; i++)
   {
      string parts[];
      if(StringSplit(windows[i], '-', parts) != 2) continue;
      datetime a = StringToTime(parts[0]);
      datetime b = StringToTime(parts[1]);
      if(now >= a && now <= b) return(true);
   }
   return(false);
}

int CountOpen()
{
   int open = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderMagicNumber() != Magic) continue;
      if(OrderType() == OP_BUY || OrderType() == OP_SELL) open++;
   }
   return(open);
}

bool FiltersOK(string &why)
{
   datetime now = NowUTC();
   if(!InSession(now))      { why = "outside trading hours"; return(false); }
   if(InNewsBlackout(now))  { why = "news blackout";         return(false); }

   int limit = MaxSpreadLimit();
   if(limit <= 0)           { why = "MaxSpreadPoints not set for this symbol"; return(false); }
   if((int)MarketInfo(Symbol(), MODE_SPREAD) > limit) { why = "spread too high"; return(false); }

   if(CountOpen() >= MaxOpen) { why = "max open positions reached"; return(false); }
   return(true);
}

//+------------------------------------------------------------------+
//| Lot size from % risk                                             |
//+------------------------------------------------------------------+
double LotSize(double entry, double sl)
{
   double tickSize  = MarketInfo(Symbol(), MODE_TICKSIZE);
   double tickValue = MarketInfo(Symbol(), MODE_TICKVALUE);
   double step      = MarketInfo(Symbol(), MODE_LOTSTEP);
   double minLot    = MarketInfo(Symbol(), MODE_MINLOT);
   double maxLot    = MarketInfo(Symbol(), MODE_MAXLOT);
   if(tickSize <= 0 || tickValue <= 0 || step <= 0) return(0);

   double riskMoney  = AccountEquity() * RiskPct / 100.0;
   double lossPerLot = MathAbs(entry - sl) / tickSize * tickValue;
   if(lossPerLot <= 0) return(0);

   double vol = MathFloor(riskMoney / lossPerLot / step + 1e-9) * step;
   if(vol < minLot) return(0);
   if(vol > maxLot) vol = maxLot;

   int lotDigits = 2;
   if(step >= 1.0)      lotDigits = 0;
   else if(step >= 0.1) lotDigits = 1;
   return(NormalizeDouble(vol, lotDigits));
}

//+------------------------------------------------------------------+
//| Orders                                                           |
//+------------------------------------------------------------------+
void CancelPending()
{
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol() != Symbol() || OrderMagicNumber() != Magic) continue;
      if(OrderType() == OP_BUYSTOP || OrderType() == OP_SELLSTOP)
      {
         if(!OrderDelete(OrderTicket()))
            Print("OrderDelete failed, error ", GetLastError());
      }
   }
}

// returns a short text describing what happened (shown in the status panel)
string Place(int side, double entry, double sl, double tp)
{
   string name = (side == OP_BUYSTOP ? "BUY STOP" : "SELL STOP");
   string msg;

   entry = NormalizeDouble(entry, Digits);
   sl    = NormalizeDouble(sl, Digits);
   tp    = NormalizeDouble(tp, Digits);

   if(!IsTradeAllowed())
   {
      msg = name + " signal skipped: trading is disabled (AutoTrading button / Allow live trading)";
      Print(Symbol(), ": ", msg);
      return(msg);
   }

   double vol = LotSize(entry, sl);
   if(vol <= 0)
   {
      msg = name + " signal skipped: lot too small for this risk";
      Print(Symbol(), ": ", msg);
      return(msg);
   }

   // broker minimum distance for pending price, SL and TP
   double minDist = MarketInfo(Symbol(), MODE_STOPLEVEL) * Point;
   RefreshRates();
   if((side == OP_BUYSTOP  && entry < Ask + minDist) ||
      (side == OP_SELLSTOP && entry > Bid - minDist))
   {
      msg = name + " signal skipped: price already at / too close to entry";
      Print(Symbol(), ": ", msg);
      return(msg);
   }
   if(MathAbs(entry - sl) < minDist || MathAbs(tp - entry) < minDist)
   {
      msg = name + " signal skipped: SL/TP closer than broker stop level";
      Print(Symbol(), ": ", msg);
      return(msg);
   }

   ResetLastError();
   int ticket = OrderSend(Symbol(), side, vol, entry, Slippage, sl, tp, "brooks_mc", Magic, 0, clrNONE);
   if(ticket < 0)
   {
      msg = name + " failed, error " + IntegerToString(GetLastError());
      Print(Symbol(), ": ", msg, " price ", DoubleToString(entry, Digits), " vol ", DoubleToString(vol, 2));
      return(msg);
   }

   msg = name + " placed at " + DoubleToString(entry, Digits) +
         "  SL " + DoubleToString(sl, Digits) + "  TP " + DoubleToString(tp, Digits) +
         "  lot " + DoubleToString(vol, 2);
   Print(Symbol(), ": ", msg, " ticket ", ticket);
   if(AlertOnOrder) Alert("BrooksMicroChannel ", Symbol(), ": ", msg);
   return(msg);
}

//+------------------------------------------------------------------+
//| Status panel (top-left corner of the chart)                      |
//+------------------------------------------------------------------+
void ShowStatus()
{
   if(!ShowPanel) return;

   datetime now   = NowUTC();
   int      limit = MaxSpreadLimit();
   string   s     = "BrooksMicroChannel v1.11  |  signals on " + TFName(SignalTF) + "\n";

   if(IsTradeAllowed()) s += "Trading: ENABLED\n";
   else                 s += "Trading: DISABLED  ->  turn on the AutoTrading button and 'Allow live trading'\n";

   s += "UTC time: " + TimeToString(now, TIME_MINUTES) + "  |  session " +
        IntegerToString(SessionStartUTC) + ":00-" + IntegerToString(SessionEndUTC) + ":00  ->  " +
        (InSession(now) ? "OPEN" : "CLOSED") + "\n";
   s += "Spread: " + IntegerToString((int)MarketInfo(Symbol(), MODE_SPREAD)) + "  (max " +
        (limit > 0 ? IntegerToString(limit) : "NOT SET") + ")\n";
   s += "Open positions: " + IntegerToString(CountOpen()) + " / " + IntegerToString(MaxOpen) + "\n";
   s += "Loss today: " + DoubleToString(LossPct("day_eq"), 2) + "% (limit " + DoubleToString(MaxDailyLossPct, 1) +
        "%)  |  this month: " + DoubleToString(LossPct("mon_eq"), 2) + "% (limit " + DoubleToString(MaxMonthlyDDPct, 1) + "%)\n";
   if(FileIsExist(KillFile)) s += "KILL FILE FOUND - no new orders\n";
   s += "Last check: " + g_last;
   if(PublishSignals) s += "\n" + g_pubStatus;

   Comment(s);
}
//+------------------------------------------------------------------+
