package com.soverixnet.surachat;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.InputType;
import android.view.View;
import android.view.Gravity;
import android.view.WindowInsets;
import android.os.Build;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.text.Editable;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Android native staging client for SURA CHAT.
 * Social/chat/room controls are wired to the dedicated staging API.
 * RTC audio, coin spending, gifts, and payments are NOT implemented by this UI.
 */
public final class MainActivity extends Activity {
    private static final int BG = RoyalTheme.NAVY;
    private static final int PANEL = RoyalTheme.PANEL;
    private static final int GOLD = RoyalTheme.GOLD;
    private static final int WHITE = RoyalTheme.CREAM;
    private static final int MUTED = RoyalTheme.MUTED;
    private final ApiClient api = new ApiClient();
    private LinearLayout appRoot;
    private String country = "";
    private String publicId = "";
    private String activeRoom = null;
    private String activeRoomName = "";
    private String view = "login";
    private boolean returningFromRoom = false;
    private boolean joinInFlight = false;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        showAuth(false);
    }

    @Override protected void onResume() {
        super.onResume();
        if (returningFromRoom && api.signedIn()) {
            returningFromRoom = false;
            showRooms("all", "popular");
        }
    }

    @Override protected void onDestroy() {
        api.close();
        super.onDestroy();
    }

    private int dp(int value) { return (int)(getResources().getDisplayMetrics().density * value + 0.5f); }

    private LinearLayout page(String heading) {
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        appRoot = new LinearLayout(this);
        appRoot.setOrientation(LinearLayout.VERTICAL);
        appRoot.setBackgroundColor(BG);
        if (Build.VERSION.SDK_INT >= 30) {
            appRoot.setOnApplyWindowInsetsListener((v, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                v.setPadding(0, bars.top, 0, bars.bottom);
                return insets;
            });
        } else {
            appRoot.setFitsSystemWindows(true);
        }
        ScrollView scroller = new ScrollView(this);
        scroller.setFillViewport(true);
        scroller.setClipToPadding(false);
        scroller.setVerticalScrollBarEnabled(false);
        scroller.setBackgroundColor(BG);
        appRoot.addView(scroller, new LinearLayout.LayoutParams(-1, 0, 1));
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(15),dp(9),dp(15),dp(18));
        scroller.addView(content);

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        TextView emblem = RoyalTheme.avatar(this,"♛");
        header.addView(emblem,new LinearLayout.LayoutParams(dp(41),dp(41)));
        LinearLayout brandText = new LinearLayout(this);
        brandText.setOrientation(LinearLayout.VERTICAL);
        brandText.setPadding(dp(9), 0, 0, 0);
        TextView brand = RoyalTheme.text(this,"✦ SURA CHAT",23,GOLD,true);
        brandText.addView(brand);
        brandText.addView(RoyalTheme.text(this,"ROYAL VOICE COMMUNITY",9,MUTED,true));
        header.addView(brandText,new LinearLayout.LayoutParams(0,-2,1));
        TextView sparkle = RoyalTheme.text(this,"✧",28,GOLD,true);
        sparkle.setGravity(Gravity.CENTER);
        header.addView(sparkle,new LinearLayout.LayoutParams(dp(34),dp(39)));
        content.addView(header,RoyalTheme.margins(this,65,0,0,4));
        if (!"".equals(heading)) {
            content.addView(RoyalTheme.title(this,heading,""));
        }
        setContentView(appRoot);
        return content;
    }

    private TextView text(String str, int sp, int color) {
        TextView t = new TextView(this);
        t.setText(str);
        t.setTextColor(color);
        t.setTextSize(sp);
        t.setPadding(dp(7), dp(10), dp(7), dp(10));
        return t;
    }

    private Button button(String title, View.OnClickListener action) {
        Button b = new Button(this);
        b.setAllCaps(false);
        b.setText(title);
        b.setTextSize(14);
        b.setTextColor(WHITE);
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{PANEL, Color.rgb(71, 38, 96)});
        bg.setCornerRadius(dp(15));
        bg.setStroke(dp(1), GOLD);
        b.setBackground(bg);
        b.setOnClickListener(action);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(50));
        p.setMargins(dp(2), dp(5), dp(2), dp(5));
        b.setLayoutParams(p);
        return b;
    }


    // Content wraps to its text and scales across screen sizes; no clipped subtitles.
    private LinearLayout featureCard(String heading, String subtitle, String iconName, View.OnClickListener action) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(11),dp(10),dp(12),dp(10));
        card.setBackground(RoyalTheme.bg(this,true,19));
        card.setMinimumHeight(dp(93));
        card.addView(RoyalIcons.view(this,iconName,66,"✦"),
            new LinearLayout.LayoutParams(dp(66),dp(66)));
        LinearLayout labels = new LinearLayout(this);
        labels.setOrientation(LinearLayout.VERTICAL);
        labels.setPadding(dp(12),0,0,0);
        TextView title = RoyalTheme.text(this,heading,16,WHITE,true);
        labels.addView(title);
        TextView description = RoyalTheme.text(this,subtitle,12,MUTED,false);
        description.setMaxLines(3);
        labels.addView(description);
        card.addView(labels,new LinearLayout.LayoutParams(0,-2,1));
        if (action != null) {
            TextView chevron = RoyalTheme.text(this,"›",26,GOLD,true);
            chevron.setGravity(Gravity.CENTER);
            card.addView(chevron,new LinearLayout.LayoutParams(dp(22),dp(48)));
            card.setOnClickListener(action);
            card.setContentDescription(heading);
        }
        card.setLayoutParams(RoyalTheme.margins(this,-2,0,5,5));
        return card;
    }

    private Button goldAction(String label, View.OnClickListener click) {
        Button b = button(label, click);
        b.setBackground(RoyalTheme.goldButton(this));
        b.setTextColor(BG);
        b.setTypeface(Typeface.DEFAULT,Typeface.BOLD);
        b.setTextSize(16);
        return b;
    }

    private void hero(LinearLayout parent, String kicker, String title, String subtitle, String image, View.OnClickListener click) {
        LinearLayout panel = RoyalTheme.hero(this,kicker,title,subtitle,image);
        panel.setLayoutParams(RoyalTheme.margins(this,148,0,5,9));
        if (click != null) panel.setOnClickListener(click);
        parent.addView(panel);
    }

    private void notice(LinearLayout parent, String title, String message) {
        LinearLayout box = RoyalTheme.framed(this);
        box.addView(RoyalTheme.text(this,title,16,GOLD,true));
        box.addView(RoyalTheme.text(this,message,13,MUTED,false));
        parent.addView(box,RoyalTheme.margins(this,-2,0,5,8));
    }

    private EditText field(LinearLayout parent, String hint, int inputType, String initial) {
        EditText field = new EditText(this);
        field.setHint(hint);
        field.setTextColor(WHITE);
        field.setHintTextColor(MUTED);
        field.setTextSize(15);
        field.setInputType(inputType);
        field.setSingleLine(true);
        field.setText(initial);
        field.setPadding(dp(12), dp(13), dp(12), dp(13));
        GradientDrawable inputBackground = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{PANEL, Color.rgb(35, 26, 62)});
        inputBackground.setCornerRadius(dp(12));
        inputBackground.setStroke(dp(1), Color.rgb(134, 107, 166));
        field.setBackground(inputBackground);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, dp(54));
        p.setMargins(0, dp(6), 0, dp(6));
        parent.addView(field, p);
        return field;
    }

    private void notifyUser(String text) { Toast.makeText(this, text, Toast.LENGTH_LONG).show(); }
    private void error(int code, JSONObject data) {
        notifyUser((code == 0 ? "Network: " : "HTTP " + code + " · ") + data.optString("error", "request_failed"));
    }
    private String typed(EditText e) { return e.getText().toString().trim(); }


    private void showAuth(boolean register) {
        view = "login";
        activeRoom = null;
        LinearLayout p = page("");
        hero(p,"ROYAL SOCIAL LOUNGE","Connect · Talk · Make Friends",
            "A welcoming home for live voice rooms and conversations.",
            "sura_voice_support",null);
        LinearLayout switcher = new LinearLayout(this);
        switcher.setOrientation(LinearLayout.HORIZONTAL);
        Button loginTab = button("Login",v -> showAuth(false));
        Button signupTab = button("Sign up",v -> showAuth(true));
        loginTab.setBackground(register?RoyalTheme.bg(this,false,16):RoyalTheme.goldButton(this));
        signupTab.setBackground(register?RoyalTheme.goldButton(this):RoyalTheme.bg(this,false,16));
        loginTab.setTextColor(register?WHITE:BG);
        signupTab.setTextColor(register?BG:WHITE);
        switcher.addView(loginTab,new LinearLayout.LayoutParams(0,dp(51),1));
        switcher.addView(signupTab,new LinearLayout.LayoutParams(0,dp(51),1));
        p.addView(switcher,RoyalTheme.margins(this,55,0,7,12));

        LinearLayout form = RoyalTheme.framed(this);
        form.addView(RoyalTheme.text(this,register?"Create your account":"Welcome back",21,WHITE,true));
        form.addView(RoyalTheme.text(this,
            register?"Join the SURA CHAT community":"Sign in securely with your email and password",
            12,MUTED,false));
        EditText name = register ? field(form,"Nickname (2–40 characters)",InputType.TYPE_CLASS_TEXT,"") : null;
        EditText email = field(form,"Email address",InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS,"");
        EditText pin = field(form, register?"8-digit numeric password":"Password",
                register?(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD):
                         (InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD),"");
        EditText region = register ? field(form,"Country code (BD, OM, IN…)",InputType.TYPE_CLASS_TEXT,country) : null;
        Button submit = goldAction(register?"Create account":"Sign in",null);
        form.addView(submit);
        submit.setOnClickListener(v -> {
            try {
                JSONObject payload = new JSONObject()
                    .put("email",typed(email)).put("password",typed(pin));
                if (register) payload.put("display_name",typed(name))
                    .put("country_code",typed(region).toUpperCase(java.util.Locale.ROOT));
                submit.setEnabled(false);
                submit.setText("Connecting…");
                api.post(register?"/api/v1/auth/signup":"/api/v1/auth/login", payload, (status,response)->{
                    submit.setEnabled(true);
                    submit.setText(register?"Create account":"Sign in");
                    if (isFinishing() || isDestroyed()) return;
                    if (status<200 || status>=300) {error(status,response);return;}
                    String token=response.optString("token","");
                    if(token.isEmpty()) {notifyUser("Missing session token");return;}
                    api.setSession(token);
                    JSONObject user=response.optJSONObject("user");
                    if(user!=null) {
                        country=user.optString("country_code","");
                        if ("null".equals(country)) country="";
                        publicId=user.optString("public_id","");
                    }
                    showHome();
                });
            } catch(Exception ex) { notifyUser("Please check all account fields");}
        });
        form.addView(RoyalTheme.text(this,
            "This staging build uses email/password. Google, phone and other social sign-ins are not connected.",
            11,MUTED,false));
        p.addView(form,RoyalTheme.margins(this,-2,0,4,10));
    }

    private LinearLayout shell(String section) {
        view = section;
        LinearLayout p = page(section);
        LinearLayout tabs = new LinearLayout(this);
        tabs.setOrientation(LinearLayout.HORIZONTAL);
        tabs.setPadding(dp(6),dp(5),dp(6),dp(6));
        tabs.setBackground(RoyalTheme.bg(this,false,22));
        String[] names = {"Home","Rooms","Moments","Messages","Profile"};
        String[] icons = {"sura_community","sura_voice_support","sura_diamond_wallet","sura_messages","sura_special_id"};
        Runnable[] actions = {this::showHome,() -> showRooms("all","popular"),
            this::showMoments,this::showMessages,this::showMe};
        String active = section.startsWith("Room") || section.startsWith("Create") ? "Rooms"
            : section.startsWith("My profile") ? "Profile" : section.startsWith("Home") ? "Home"
            : section;
        for (int i = 0; i < names.length; i++) {
            final int selected = i;
            Button b = new Button(this);
            b.setAllCaps(false);
            b.setText(names[i]);
            b.setTextSize(10);
            b.setTextColor(names[i].equals(active)?BG:WHITE);
            b.setMinHeight(0);
            b.setMinimumHeight(0);
            b.setPadding(0,0,0,0);
            b.setGravity(Gravity.CENTER);
            b.setBackground(names[i].equals(active)?RoyalTheme.goldButton(this):
                    RoyalTheme.bg(this,false,15));
            RoyalIcons.decorateButton(this,b,icons[i],20,true);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0,dp(56),1);
            lp.setMargins(dp(2),0,dp(2),0);
            tabs.addView(b,lp);
            b.setOnClickListener(v -> actions[selected].run());
        }
        appRoot.addView(tabs,new LinearLayout.LayoutParams(-1,dp(68)));
        return p;
    }

    private void showHome() {
        LinearLayout p = shell("Home · Discover");
        hero(p,"✦ WELCOME TO SURA CHAT","Join live voice rooms",
             "Find your circle · Make friends · Share moments",
             "sura_voice_support",v -> showRooms("all","popular"));
        p.addView(goldAction("✧ Explore rooms", v -> showRooms("all","popular")));
        RoyalTheme.displaySection(p,this,"Discover","Your community at a glance");
        p.addView(featureCard("Voice Rooms","Browse live rooms around the world",
                "sura_voice_support",v -> showRooms("all","popular")));
        p.addView(featureCard("Moments","Read and share community updates",
                "sura_community",v -> showMoments()));
        p.addView(featureCard("Private Messages","Your real conversations",
                "sura_messages",v -> showMessages()));
        p.addView(featureCard("Event Center","Upcoming campaigns & promotions",
                "sura_recharge",v -> showEvents()));
        p.addView(featureCard("Rankings","Daily, weekly and monthly leaderboards",
                "sura_vip",v -> showRanking()));
        RoyalTheme.displaySection(p,this,"Live Rooms","Showing real rooms from the server");
        LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        list.addView(RoyalTheme.text(this,"Loading live rooms…",13,MUTED,false));
        p.addView(list);
        api.get("/api/v1/rooms?scope=all&sort=popular&limit=6&home_country="+country,(status,json)->{
            if (isFinishing() || isDestroyed() || list.getParent()==null) return;
            list.removeAllViews();
            if(status!=200) {
                list.addView(RoyalTheme.text(this,"Rooms are temporarily unavailable.",13,MUTED,false));
                return;
            }
            JSONArray rooms=json.optJSONArray("rooms");
            if(rooms==null||rooms.length()==0) {
                list.addView(RoyalTheme.text(this,"No live rooms yet. Create the first one!",13,MUTED,false));
                return;
            }
            for(int i=0;i<Math.min(rooms.length(),3);i++){
                JSONObject room=rooms.optJSONObject(i);
                if(room!=null) list.addView(roomTile(room));
            }
        });
        RoyalTheme.displaySection(p,this,"Latest Moments","Posts from real members");
        TextView feed=RoyalTheme.text(this,"Loading moments…",13,MUTED,false);
        p.addView(feed);
        api.get("/api/v1/moments?limit=3",(code,json)->{
            if(isFinishing()||isDestroyed()||feed.getParent()==null) return;
            if(code!=200){feed.setText("Moments are unavailable right now.");return;}
            JSONArray moments=json.optJSONArray("moments");
            if(moments==null || moments.length()==0){feed.setText("No Moments yet.");return;}
            StringBuilder out=new StringBuilder();
            for(int i=0;i<moments.length();i++){
                JSONObject m=moments.optJSONObject(i);
                if(m!=null)out.append("✦ ").append(m.optString("author_name","Member"))
                    .append("\n").append(m.optString("body","")).append("\n\n");
            }
            feed.setText(out.toString());
        });
    }

    private LinearLayout roomTile(JSONObject room) {
        String id=room.optString("id");
        String name=room.optString("name","Voice Room");
        String code=room.optString("country_code","Global");
        LinearLayout tile=RoyalTheme.framed(this);
        tile.setOrientation(LinearLayout.HORIZONTAL);
        tile.setGravity(Gravity.CENTER_VERTICAL);
        tile.addView(RoyalIcons.view(this,"sura_voice_support",74,"♛"),
                new LinearLayout.LayoutParams(dp(74),dp(74)));
        LinearLayout words=new LinearLayout(this);
        words.setOrientation(LinearLayout.VERTICAL);
        words.setPadding(dp(11),0,0,0);
        TextView title=RoyalTheme.text(this,name,16,WHITE,true);
        title.setSingleLine(true);
        title.setEllipsize(TextUtils.TruncateAt.END);
        words.addView(title);
        words.addView(RoyalTheme.text(this,
                (code.equals("null")?"Global":code)+" · "+room.optInt("active_count",0)+" members",12,MUTED,false));
        words.addView(RoyalTheme.text(this,"JOIN ROOM  ›",11,GOLD,true));
        tile.addView(words,new LinearLayout.LayoutParams(0,-2,1));
        tile.setMinimumHeight(dp(101));
        tile.setOnClickListener(v -> joinRoom(id,name,code));
        tile.setContentDescription("Join room "+name);
        tile.setLayoutParams(RoyalTheme.margins(this,-2,0,5,5));
        return tile;
    }

    private void showRooms(String scope, String sort) {
        LinearLayout p = shell("Rooms");
        LinearLayout filters = new LinearLayout(this);
        filters.setOrientation(LinearLayout.HORIZONTAL);
        String[] names = {"Popular", "New", "My", "History"};
        String[] scopes = {"all", "all", "mine", "history"};
        String[] sorts = {"popular", "new", "new", "new"};
        for (int i = 0; i < names.length; i++) {
            final int x = i;
            Button b = button(names[i], v -> showRooms(scopes[x], sorts[x]));
            b.setTextSize(11);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(45), 1);
            lp.setMargins(dp(1), dp(4), dp(1), dp(4));
            filters.addView(b, lp);
        }
        p.addView(filters);
        TextView state = text("Fetching rooms…", 13, MUTED);
        p.addView(state);
        String url = "/api/v1/rooms?scope=" + scope + "&sort=" + sort
                + "&home_country=" + country + "&limit=30";
        api.get(url, (status, body) -> {
            if (status != 200) { state.setText("Could not load rooms."); error(status, body); return; }
            state.setText("");
            JSONArray rooms = body.optJSONArray("rooms");
            if (rooms == null || rooms.length() == 0) { state.setText("No rooms found. Create one!"); return; }
            for (int i = 0; i < rooms.length(); i++) {
                JSONObject room = rooms.optJSONObject(i);
                if (room == null) continue;
                String id = room.optString("id");
                String name = room.optString("name", "Voice room");
                String roomCountry = room.optString("country_code", "Global");
                LinearLayout tile = new LinearLayout(this);
                tile.setOrientation(LinearLayout.HORIZONTAL);
                tile.setGravity(android.view.Gravity.CENTER_VERTICAL);
                tile.setPadding(dp(13), dp(12), dp(12), dp(12));
                GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                        new int[]{Color.rgb(49, 32, 75), Color.rgb(28, 24, 63)});
                bg.setCornerRadius(dp(18));
                bg.setStroke(dp(1), Color.rgb(137, 106, 163));
                tile.setBackground(bg);
                tile.setElevation(dp(3));
                LinearLayout.LayoutParams card = new LinearLayout.LayoutParams(-1, dp(90));
                card.setMargins(dp(3), dp(6), dp(3), dp(6));
                View crest = RoyalIcons.view(this, "sura_voice_support", 55, "✦");
                crest.setBackground(bgForCrest());
                tile.addView(crest, new LinearLayout.LayoutParams(dp(55), dp(55)));
                LinearLayout words = new LinearLayout(this);
                words.setOrientation(LinearLayout.VERTICAL);
                words.setPadding(dp(11), 0, 0, 0);
                TextView title = text(name, 16, Color.WHITE);
                title.setTypeface(null, Typeface.BOLD);
                title.setSingleLine(true);
                title.setEllipsize(android.text.TextUtils.TruncateAt.END);
                words.addView(title);
                words.addView(text((roomCountry.equals("null") ? "Global" : roomCountry)
                        + "  ·  " + room.optInt("active_count", 0) + " members", 11, MUTED));
                tile.addView(words, new LinearLayout.LayoutParams(0, -2, 1));
                TextView enter = text("›", 30, GOLD);
                enter.setGravity(android.view.Gravity.CENTER);
                tile.addView(enter, new LinearLayout.LayoutParams(dp(32), -1));
                tile.setOnClickListener(v -> joinRoom(id, name, roomCountry));
                p.addView(tile, card);
            }
        });
    }

    private GradientDrawable bgForCrest() {
        GradientDrawable d = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{Color.rgb(66, 48, 99), Color.rgb(20, 25, 53)});
        d.setShape(GradientDrawable.OVAL);
        d.setStroke(dp(2), GOLD);
        return d;
    }

    private void showCreate() {
        LinearLayout p = shell("Create a room");
        EditText name = field(p, "Room title", InputType.TYPE_CLASS_TEXT, "");
        EditText seats = field(p, "Seats: 4, 8, 12 or 16", InputType.TYPE_CLASS_NUMBER, "8");
        p.addView(text("Choose a stage layout. The owner does not sit automatically.", 13, MUTED));
        Button createButton = button("✦  Create Royal Room", null);
        p.addView(createButton);
        createButton.setOnClickListener(v -> {
            String roomTitle = typed(name);
            String count = typed(seats);
            if (roomTitle.length() < 3 || roomTitle.length() > 64 ||
                    !("4".equals(count) || "8".equals(count) ||
                      "12".equals(count) || "16".equals(count))) {
                notifyUser("Room title: 3–64 characters. Seats: 4, 8, 12 or 16.");
                return;
            }
            try {
                JSONObject request = new JSONObject()
                    .put("name", roomTitle).put("seat_count", Integer.parseInt(count));
                if (!country.isEmpty()) request.put("country_code", country);
                createButton.setEnabled(false);
                createButton.setText("Creating room…");
                api.post("/api/v1/rooms", request, (code, json) -> {
                    createButton.setEnabled(true);
                    createButton.setText("✦  Create Royal Room");
                    if (isFinishing() || isDestroyed()) return;
                    if (code != 201) { error(code, json); return; }
                    JSONObject room = json.optJSONObject("room");
                    if (room == null) { notifyUser("Room creation response was empty"); return; }
                    openRoom(room.optString("id"), room.optString("name"),
                            room.optString("country_code", ""));
                });
            } catch (Exception ex) { notifyUser("Could not create room"); }
        });
    }

    private void joinRoom(String roomId, String title, String roomCountry) {
        if (joinInFlight) return;
        joinInFlight = true;
        notifyUser("Entering " + title + "…");
        api.post("/api/v1/rooms/" + roomId + "/join", new JSONObject(), (code, body) -> {
            joinInFlight = false;
            if (isFinishing() || isDestroyed()) return;
            if (code != 200) { error(code, body); return; }
            openRoom(roomId, title, roomCountry);
        });
    }

    private void openRoom(String roomId, String title, String roomCountry) {
        if (roomId == null || !roomId.matches("[0-9a-fA-F-]{36}") || !api.signedIn()) {
            notifyUser("Room or session unavailable");
            return;
        }
        Intent intent = new Intent(this, RoomActivity.class);
        intent.putExtra("room_id", roomId);
        intent.putExtra("room_name", title);
        intent.putExtra("country", roomCountry);
        intent.putExtra("public_id", publicId);
        intent.putExtra("token", api.getSession());
        returningFromRoom = true;
        startActivity(intent);
    }

    private void showMessages() {
        LinearLayout p = shell("Messages");
        p.addView(featureCard("Private Chat", "One-to-one conversations", "sura_messages", null));
        TextView list = text("Loading private conversations…", 14, MUTED);
        p.addView(list);
        api.get("/api/v1/messages/threads", (code, json) -> {
            if (code != 200) { error(code, json); return; }
            JSONArray chats = json.optJSONArray("conversations");
            if (chats == null || chats.length() == 0) { list.setText("No conversations yet."); return; }
            StringBuilder text = new StringBuilder();
            for (int i = 0; i < chats.length(); i++) {
                JSONObject item = chats.optJSONObject(i);
                if (item != null) text.append(item.optString("display_name", "User"))
                    .append(": ").append(item.optString("last_message", "")).append("\n\n");
            }
            list.setText(text.toString());
        });
    }

    private void showMe() {
        LinearLayout p = shell("My profile");
        TextView profile = text("Loading…", 15, GOLD);
        p.addView(profile);
        EditText name = field(p, "Display name", InputType.TYPE_CLASS_TEXT, "");
        EditText bio = field(p, "Bio", InputType.TYPE_CLASS_TEXT, "");
        api.get("/api/v1/me", (code, json) -> {
            if (code != 200) { error(code, json); return; }
            JSONObject me = json.optJSONObject("user");
            if (me != null) {
                publicId = me.optString("public_id");
                profile.setText("SURA ID: " + publicId + " · " + me.optString("country_code", "Global"));
                name.setText(me.optString("display_name", ""));
                bio.setText(me.optString("bio", ""));
            }
        });
        p.addView(button("Save profile", v -> {
            try {
                JSONObject request = new JSONObject().put("display_name", typed(name)).put("bio", typed(bio));
                api.post("/api/v1/me/profile", request, (code, json) -> {
                    if (code == 200) notifyUser("Profile saved"); else error(code, json);
                });
            } catch (Exception ignored) { }
        }));
        p.addView(featureCard("Special ID · Preview", "Royal profile ID design", "sura_special_id", null));
        p.addView(featureCard("VIP · Preview", "VIP decoration only", "sura_vip", null));
        p.addView(featureCard("Coin Wallet · Preview", "Coin transactions are disabled", "sura_coin_rewards", null));
        p.addView(featureCard("Diamond Wallet · Preview", "Diamonds are not yet enabled", "sura_diamond_wallet", null));
        p.addView(featureCard("Recharge · Preview", "Purchases are not yet enabled", "sura_recharge", null));
        p.addView(button("Sign out", v -> api.post("/api/v1/auth/logout", new JSONObject(), (code, body) -> {
            api.setSession("");
            country = "";
            publicId = "";
            showAuth(false);
        })));
    }

    @Override public void onBackPressed() {
        if ("login".equals(view)) {
            super.onBackPressed();
            return;
        }
        new android.app.AlertDialog.Builder(this)
                .setTitle("Exit SURA CHAT?")
                .setMessage("Close the app? Your account stays signed in only until the app restarts.")
                .setNegativeButton("Stay", null)
                .setPositiveButton("Exit", (dialog, which) -> finish())
                .show();
    }
}
