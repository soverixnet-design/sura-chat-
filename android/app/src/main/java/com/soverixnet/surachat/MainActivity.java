package com.soverixnet.surachat;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.InputType;
import android.view.View;
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
    private static final int BG = Color.rgb(16, 19, 41);
    private static final int PANEL = Color.rgb(49, 32, 75);
    private static final int GOLD = Color.rgb(233, 190, 104);
    private static final int WHITE = Color.rgb(246, 244, 252);
    private static final int MUTED = Color.rgb(192, 185, 213);
    private final ApiClient api = new ApiClient();
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
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(16), dp(18), dp(16), dp(30));
        content.setBackgroundColor(BG);
        ScrollView scroller = new ScrollView(this);
        scroller.setFillViewport(true);
        scroller.setBackgroundColor(BG);
        scroller.addView(content);
        setContentView(scroller);
        TextView brand = text("✦ SURA CHAT", 25, GOLD);
        brand.setTypeface(null, Typeface.BOLD);
        content.addView(brand);
        content.addView(text(heading, 18, WHITE));
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
        LinearLayout p = page(register ? "Create your account" : "Welcome back");
        p.addView(text("Royal Premium voice-room community · staging preview", 13, MUTED));
        EditText name = register ? field(p, "Nickname (2–40 characters)", InputType.TYPE_CLASS_TEXT, "") : null;
        EditText email = field(p, "Email address", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS, "");
        EditText pin = field(p, register ? "8-digit numeric password" : "Password",
                register ? (InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD)
                        : (InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD), "");
        EditText region = register ? field(p, "Country code (BD, OM, IN…)", InputType.TYPE_CLASS_TEXT, country) : null;
        p.addView(button(register ? "Sign up" : "Sign in", v -> {
            try {
                JSONObject payload = new JSONObject()
                    .put("email", typed(email)).put("password", typed(pin));
                if (register) payload.put("display_name", typed(name))
                    .put("country_code", typed(region).toUpperCase(java.util.Locale.ROOT));
                api.post(register ? "/api/v1/auth/signup" : "/api/v1/auth/login", payload, (status, response) -> {
                    if (status < 200 || status >= 300) { error(status, response); return; }
                    String token = response.optString("token", "");
                    if (token.isEmpty()) { notifyUser("Missing session token"); return; }
                    api.setSession(token);
                    JSONObject user = response.optJSONObject("user");
                    if (user != null) {
                        country = user.optString("country_code", "");
                        if ("null".equals(country)) country = "";
                        publicId = user.optString("public_id", "");
                    }
                    showRooms("all", "popular");
                });
            } catch (Exception ex) { notifyUser("Invalid signup fields"); }
        }));
        p.addView(button(register ? "Already registered? Sign in" : "New here? Create account",
                v -> showAuth(!register)));
        p.addView(text("Passwords are sent over HTTPS. Sessions are memory-only in this preview; sign in again after restart.", 12, MUTED));
    }

    private LinearLayout shell(String section) {
        view = "home";
        LinearLayout p = page(section);
        LinearLayout tabs = new LinearLayout(this);
        tabs.setOrientation(LinearLayout.HORIZONTAL);
        String[] names = {"Home", "Rooms", "Create", "Messages", "Me"};
        Runnable[] actions = {this::showHome, () -> showRooms("all","popular"),
            this::showCreate, this::showMessages, this::showMe};
        for (int i = 0; i < names.length; i++) {
            final int selected = i;
            Button b = button(names[i], v -> actions[selected].run());
            b.setTextSize(11);
            LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, dp(47), 1);
            layout.setMargins(dp(1), dp(5), dp(1), dp(5));
            tabs.addView(b, layout);
        }
        p.addView(tabs);
        return p;
    }

    private void showHome() {
        LinearLayout p = shell("Home · Discover");
        p.addView(text("Latest Moments", 19, GOLD));
        TextView feed = text("Loading Moments…", 14, MUTED);
        p.addView(feed);
        api.get("/api/v1/moments?limit=20", (code, json) -> {
            if (code != 200) { feed.setText("Moments unavailable: " + json.optString("error")); return; }
            JSONArray moments = json.optJSONArray("moments");
            if (moments == null || moments.length() == 0) { feed.setText("No Moments yet."); return; }
            StringBuilder out = new StringBuilder();
            for (int i = 0; i < moments.length(); i++) {
                JSONObject m = moments.optJSONObject(i);
                if (m != null) out.append("✦ ").append(m.optString("author_name", "User"))
                        .append(": ").append(m.optString("body", "")).append("\n\n");
            }
            feed.setText(out.toString());
        });
        p.addView(button("Browse live rooms", v -> showRooms("all", "popular")));
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
                TextView crest = text("✦", 29, GOLD);
                crest.setGravity(android.view.Gravity.CENTER);
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
        p.addView(text("Nobody sits automatically, including the owner.", 13, MUTED));
        p.addView(button("Create room", v -> {
            try {
                JSONObject request = new JSONObject()
                    .put("name", typed(name)).put("seat_count", Integer.parseInt(typed(seats)));
                if (!country.isEmpty()) request.put("country_code", country);
                api.post("/api/v1/rooms", request, (code, json) -> {
                    if (code != 201) { error(code, json); return; }
                    JSONObject room = json.optJSONObject("room");
                    if (room == null) { notifyUser("Missing room response"); return; }
                    openRoom(room.optString("id"), room.optString("name"), room.optString("country_code", ""));
                });
            } catch (Exception ex) { notifyUser("Choose a name and valid seat count."); }
        }));
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
        p.addView(text("VIP · CP · Noble · Gift video · Wallet features: design only; not transactable yet.", 13, MUTED));
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
