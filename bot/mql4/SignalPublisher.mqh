//+------------------------------------------------------------------+
//|                                             SignalPublisher.mqh  |
//|  Read-only reporter: watches this EA's orders (same Symbol and   |
//|  Magic) and POSTs signal events to the website.                  |
//|  It never opens, modifies or closes orders.                      |
//|                                                                  |
//|  Setup:                                                          |
//|   1. Tools > Options > Expert Advisors > "Allow WebRequest for   |
//|      listed URL" -> add your site, e.g. https://example.com      |
//|   2. Create MQL4\Files\signal_publisher.cfg with 3 lines:        |
//|        url=https://example.com                                   |
//|        key=bot1                                                  |
//|        secret=<BOT secret from the server .env>                  |
//|                                                                  |
//|  Request signature (same as the server and signal_publisher.py): |
//|   canonical = ts \n nonce \n METHOD \n path \n sha256hex(body)   |
//|   X-Signature = hex(HMAC-SHA256(secret, canonical))              |
//+------------------------------------------------------------------+
#property strict

string g_pubUrl    = "";
string g_pubPath   = "/api/bot/events";
string g_pubKey    = "";
string g_pubSecret = "";
bool   g_pubReady  = false;
datetime g_pubRetryAt = 0;
string g_pubStatus = "publisher: off";

//--- per-ticket progress is kept in terminal global variables, so a restart never re-sends or loses events
//    stage 1 = new sent, 2 = activated sent, 3 = finished (closed/canceled)
string PubGV(int ticket, string what)
{
   return("BMCP_" + IntegerToString(AccountNumber()) + "_" + IntegerToString(ticket) + "_" + what);
}
double PubGet(int ticket, string what) { return(GlobalVariableCheck(PubGV(ticket, what)) ? GlobalVariableGet(PubGV(ticket, what)) : 0); }
void   PubSet(int ticket, string what, double v) { GlobalVariableSet(PubGV(ticket, what), v); }

//+------------------------------------------------------------------+
//| config                                                           |
//+------------------------------------------------------------------+
bool PubInit(string cfgFile)
{
   g_pubReady = false;
   int h = FileOpen(cfgFile, FILE_READ | FILE_TXT | FILE_ANSI);
   if(h == INVALID_HANDLE)
   {
      g_pubStatus = "publisher: config file MQL4\\Files\\" + cfgFile + " not found";
      Print(g_pubStatus);
      return(false);
   }
   while(!FileIsEnding(h))
   {
      string line = FileReadString(h);
      StringTrimLeft(line); StringTrimRight(line);
      int eq = StringFind(line, "=");
      if(eq <= 0) continue;
      string k = StringSubstr(line, 0, eq);
      string v = StringSubstr(line, eq + 1);
      StringTrimLeft(k); StringTrimRight(k); StringTrimLeft(v); StringTrimRight(v);
      if(k == "url")    g_pubUrl = v;
      if(k == "key")    g_pubKey = v;
      if(k == "secret") g_pubSecret = v;
   }
   FileClose(h);
   while(StringLen(g_pubUrl) > 0 && StringSubstr(g_pubUrl, StringLen(g_pubUrl) - 1) == "/")
      g_pubUrl = StringSubstr(g_pubUrl, 0, StringLen(g_pubUrl) - 1);
   if(g_pubUrl == "" || g_pubKey == "" || StringLen(g_pubSecret) < 32)
   {
      g_pubStatus = "publisher: config incomplete (url, key, secret>=32 chars)";
      Print(g_pubStatus);
      return(false);
   }
   MathSrand((int)GetTickCount() ^ (int)TimeLocal());
   g_pubReady  = true;
   g_pubStatus = "publisher: ready";
   return(true);
}

//+------------------------------------------------------------------+
//| crypto helpers                                                   |
//+------------------------------------------------------------------+
void PubUtf8(string s, uchar &out[])
{
   int n = StringToCharArray(s, out, 0, WHOLE_ARRAY, CP_UTF8);
   if(n > 0 && out[n - 1] == 0) n--;      // drop terminating zero
   ArrayResize(out, n);
}

string PubHex(const uchar &b[])
{
   string s = "";
   for(int i = 0; i < ArraySize(b); i++) s += StringFormat("%02x", b[i]);
   return(s);
}

bool PubSha256(const uchar &data[], uchar &out[])
{
   uchar nokey[];
   return(CryptEncode(CRYPT_HASH_SHA256, data, nokey, out) > 0);
}

string PubHmacSha256Hex(string secret, string msg)
{
   uchar key[], m[], k0[64], ipad[], opad[], inner[], innerHash[], outer[], outerHash[];
   PubUtf8(secret, key);
   PubUtf8(msg, m);
   ArrayInitialize(k0, 0);
   if(ArraySize(key) > 64)
   {
      uchar kh[];
      PubSha256(key, kh);
      ArrayCopy(k0, kh, 0, 0, ArraySize(kh));
   }
   else if(ArraySize(key) > 0)
      ArrayCopy(k0, key, 0, 0, ArraySize(key));

   int ml = ArraySize(m);
   ArrayResize(inner, 64 + ml);
   ArrayResize(outer, 64 + 32);
   for(int i = 0; i < 64; i++)
   {
      inner[i] = (uchar)(k0[i] ^ 0x36);
      outer[i] = (uchar)(k0[i] ^ 0x5c);
   }
   if(ml > 0) ArrayCopy(inner, m, 64, 0, ml);
   if(!PubSha256(inner, innerHash)) return("");
   ArrayCopy(outer, innerHash, 64, 0, 32);
   if(!PubSha256(outer, outerHash)) return("");
   return(PubHex(outerHash));
}

string PubSha256Hex(string s)
{
   uchar d[], h[];
   PubUtf8(s, d);
   PubSha256(d, h);
   return(PubHex(h));
}

string PubNonce(int ticket)
{
   string s = IntegerToString(ticket) + "x";
   for(int i = 0; i < 24; i++) s += StringFormat("%x", MathRand() % 16);
   return(s);
}

//+------------------------------------------------------------------+
//| time: broker server time -> unix UTC seconds                     |
//+------------------------------------------------------------------+
long PubUtc(datetime serverTime)
{
   long offset = (long)(TimeCurrent() - TimeGMT());
   offset = (long)MathRound(offset / 1800.0) * 1800;   // broker offsets are whole/half hours
   return((long)serverTime - offset);
}

string PubNum(double v) { return(DoubleToString(v, Digits)); }

//+------------------------------------------------------------------+
//| HTTP                                                             |
//+------------------------------------------------------------------+
// returns HTTP status, 0 on network error
int PubPost(string body, int ticket)
{
   string ts    = IntegerToString((long)TimeGMT());
   string nonce = PubNonce(ticket);
   string canon = ts + "\n" + nonce + "\nPOST\n" + g_pubPath + "\n" + PubSha256Hex(body);
   string sig   = PubHmacSha256Hex(g_pubSecret, canon);
   string headers = "Content-Type: application/json\r\n" +
                    "X-Api-Key: " + g_pubKey + "\r\n" +
                    "X-Timestamp: " + ts + "\r\n" +
                    "X-Nonce: " + nonce + "\r\n" +
                    "X-Signature: " + sig + "\r\n";
   char data[], result[];
   string resHeaders;
   int n = StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(n > 0 && data[n - 1] == 0) ArrayResize(data, n - 1);

   ResetLastError();
   int status = WebRequest("POST", g_pubUrl + g_pubPath, headers, 3000, data, result, resHeaders);
   if(status == -1)
   {
      int err = GetLastError();
      g_pubStatus = "publisher: network error " + IntegerToString(err) +
                    (err == 4060 ? " (add the URL to Tools>Options>Expert Advisors>WebRequest)" : "");
      Print(g_pubStatus);
      return(0);
   }
   if(status >= 300)
      Print("publisher: HTTP ", status, " for ", body, " -> ", CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8));
   return(status);
}

// true when the event is finished (delivered, or rejected permanently and must not be retried)
bool PubSend(string body, int ticket)
{
   int st = PubPost(body, ticket);
   if(st >= 200 && st < 300) { g_pubStatus = "publisher: ok"; return(true); }
   if(st == 400 || st == 409 || st == 413 || st == 422) return(true);   // invalid data, retrying won't help
   g_pubRetryAt = TimeLocal() + 10;                                       // network / 401 / 404 / 429 / 5xx -> retry later
   return(false);
}

string PubExt(int ticket) { return("\"" + IntegerToString(AccountNumber()) + "-" + IntegerToString(ticket) + "\""); }

bool PubIsPending(int type) { return(type == OP_BUYSTOP || type == OP_SELLSTOP || type == OP_BUYLIMIT || type == OP_SELLLIMIT); }

string PubOrderKind(int type)
{
   if(type == OP_BUYSTOP || type == OP_SELLSTOP)   return("STOP");
   if(type == OP_BUYLIMIT || type == OP_SELLLIMIT) return("LIMIT");
   return("MARKET");
}

string PubDir(int type) { return((type == OP_BUY || type == OP_BUYSTOP || type == OP_BUYLIMIT) ? "BUY" : "SELL"); }

string PubTF(int tf)
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
   }
   return("M5");
}

//+------------------------------------------------------------------+
//| event builders (currently selected order)                        |
//+------------------------------------------------------------------+
bool PubSendNew(int tf)
{
   int t = OrderTicket();
   string tp = (OrderTakeProfit() > 0 ? PubNum(OrderTakeProfit()) : "null");
   string body = "{\"type\":\"signal.new\",\"externalId\":" + PubExt(t) +
                 ",\"symbol\":\"" + OrderSymbol() + "\",\"direction\":\"" + PubDir(OrderType()) +
                 "\",\"orderType\":\"" + (PubIsPending(OrderType()) ? PubOrderKind(OrderType()) : "STOP") +
                 "\",\"entry\":" + PubNum(OrderOpenPrice()) + ",\"stopLoss\":" + PubNum(OrderStopLoss()) +
                 ",\"takeProfit\":" + tp + ",\"timeframe\":\"" + PubTF(tf) + "\",\"digits\":" + IntegerToString(Digits) +
                 ",\"signalAt\":" + IntegerToString(PubUtc(OrderOpenTime())) + "}";
   return(PubSend(body, t));
}

bool PubSendActivated()
{
   int t = OrderTicket();
   string body = "{\"type\":\"signal.activated\",\"externalId\":" + PubExt(t) + ",\"fillPrice\":" + PubNum(OrderOpenPrice()) +
                 ",\"at\":" + IntegerToString(PubUtc(OrderOpenTime())) + "}";
   return(PubSend(body, t));
}

bool PubSendUpdated()
{
   int t = OrderTicket();
   string tp = (OrderTakeProfit() > 0 ? PubNum(OrderTakeProfit()) : "null");
   string body = "{\"type\":\"signal.updated\",\"externalId\":" + PubExt(t) + ",\"stopLoss\":" + PubNum(OrderStopLoss()) +
                 ",\"takeProfit\":" + tp + ",\"at\":" + IntegerToString((long)TimeGMT()) + "}";
   return(PubSend(body, t));
}

bool PubSendCanceled()
{
   int t = OrderTicket();
   string reason = (StringFind(OrderComment(), "expiration") >= 0 ? "expired" : "deleted");
   string body = "{\"type\":\"signal.canceled\",\"externalId\":" + PubExt(t) + ",\"reason\":\"" + reason +
                 "\",\"at\":" + IntegerToString(PubUtc(OrderCloseTime())) + "}";
   return(PubSend(body, t));
}

bool PubSendClosed()
{
   int t = OrderTicket();
   string c = OrderComment();
   string reason = "UNKNOWN";
   if(StringFind(c, "[tp]") >= 0) reason = "TP";
   if(StringFind(c, "[sl]") >= 0) reason = "SL";
   string body = "{\"type\":\"signal.closed\",\"externalId\":" + PubExt(t) + ",\"exitPrice\":" + PubNum(OrderClosePrice()) +
                 ",\"reason\":\"" + reason + "\",\"fillPrice\":" + PubNum(OrderOpenPrice()) +
                 ",\"at\":" + IntegerToString(PubUtc(OrderCloseTime())) + "}";
   return(PubSend(body, t));
}

//+------------------------------------------------------------------+
//| main tracker, call at the end of OnTick()                        |
//+------------------------------------------------------------------+
void PubTick(int magic, int tf)
{
   if(!g_pubReady || IsTesting() || IsOptimization()) return;
   if(TimeLocal() < g_pubRetryAt) return;

   //--- open and pending orders of this EA on this chart's symbol
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderMagicNumber() != magic || OrderSymbol() != Symbol()) continue;
      int t = OrderTicket();
      double stage = PubGet(t, "s");

      if(stage < 1)
      {
         if(!PubSendNew(tf)) return;
         PubSet(t, "s", 1); PubSet(t, "sl", OrderStopLoss()); PubSet(t, "tp", OrderTakeProfit());
         stage = 1;
      }
      if(!PubIsPending(OrderType()) && stage < 2)
      {
         if(!PubSendActivated()) return;
         PubSet(t, "s", 2);
      }
      if(MathAbs(PubGet(t, "sl") - OrderStopLoss()) > Point / 2 || MathAbs(PubGet(t, "tp") - OrderTakeProfit()) > Point / 2)
      {
         if(!PubSendUpdated()) return;
         PubSet(t, "sl", OrderStopLoss()); PubSet(t, "tp", OrderTakeProfit());
      }
   }

   //--- tracked tickets that are no longer open: closed or deleted
   string prefix = "BMCP_" + IntegerToString(AccountNumber()) + "_";
   for(int g = GlobalVariablesTotal() - 1; g >= 0; g--)
   {
      string name = GlobalVariableName(g);
      if(StringFind(name, prefix) != 0 || StringSubstr(name, StringLen(name) - 2) != "_s") continue;
      double st = GlobalVariableGet(name);
      if(st >= 3) continue;
      int t = (int)StringToInteger(StringSubstr(name, StringLen(prefix), StringLen(name) - StringLen(prefix) - 2));
      if(!OrderSelect(t, SELECT_BY_TICKET)) continue;
      if(OrderSymbol() != Symbol() || OrderCloseTime() == 0) continue;   // still open, or another chart's order

      bool done;
      if(PubIsPending(OrderType())) done = PubSendCanceled();
      else                          done = PubSendClosed();             // carries fillPrice, so a missed activation is covered
      if(!done) return;
      GlobalVariableSet(name, 3);
      GlobalVariableDel(PubGV(t, "sl"));
      GlobalVariableDel(PubGV(t, "tp"));
   }
}
//+------------------------------------------------------------------+
