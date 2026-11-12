package com.soverixnet.surachat;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputFilter;
import android.text.InputType;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayDeque;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * SURA CHAT room: stable seat stage, fixed-height chat panel, moderation actions.
 * Voice is deliberately NOT represented as connected until a real RTC client joins.
 * All room and permission mutations are enforced by the SURA staging API.
 */
public final class RoomActivity extends Activity {
    private static final int BG = Color.rgb(16, 19, 41);
    private static final int PURPLE = Color.rgb(49, 32, 75);
    private static final int GOLD = Color.rgb(233, 190, 104);
    private static final int TEAL = Color.rgb(47, 214, 209);
    private static final int WHITE = Color.rgb(247, 246, 251);
    private static final int MUTED = Color.rgb(194, 185, 211);
    private static final int RED = Color.rgb(244, 123, 142);

    private final ApiClient api = new ApiClient();
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService avatarExecutor = Executors.newFixedThreadPool(2);
    private final LinkedHashMap<String, Bitmap> avatarCache = new LinkedHashMap<String, Bitmap>(48, 0.75f, true) {
        @Override protected boolean removeEldestEntry(java.util.Map.Entry<String, Bitmap> oldest) {
            return size() > 48;
        }
    };
    private final ArrayDeque<String> chatLines = new ArrayDeque<>();
    private String roomId, roomName, publicId, country;
    private String lastSeatSnapshot = "";
    private String announcementText = "";
    private int lastMessageId = 0;
    private int mySeat = 0;
    private boolean moderator = false;
    private boolean owner = false;
    private boolean seatRequest = false;
    private boolean seatFetch = false;
    private boolean chatFetch = false;
    private boolean resumed = false;
    private boolean leaving = false;
    private TextView headerName, announcement, seatStatus, chatHistory, liveLabel;
    private ScrollView chatScroll;
    private EditText chatInput;
    private Button sendButton;
    private LinearLayout seatStage;
    private final Runnable poll = new Runnable() {
        @Override public void run() {
            if (!resumed || leaving) return;
            refreshSeats();
            refreshMessages();
            ui.postDelayed(this, 4500);
        }
    };

    private int dp(float x) { return (int) (getResources().getDisplayMetrics().density * x + 0.5f); }
    private int width() { return (int)(getResources().getDisplayMetrics().widthPixels / getResources().getDisplayMetrics().density); }
    private int height() { return (int)(getResources().getDisplayMetrics().heightPixels / getResources().getDisplayMetrics().density); }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        roomId = getIntent().getStringExtra("room_id");
        roomName = getIntent().getStringExtra("room_name");
        publicId = getIntent().getStringExtra("public_id");
        country = getIntent().getStringExtra("country");
        String token = getIntent().getStringExtra("token");
        if (roomId == null || !roomId.matches("[0-9a-fA-F-]{36}") ||
                token == null || token.isEmpty()) {
            finish();
            return;
        }
        api.setSession(token);
        if (roomName == null || roomName.isEmpty()) roomName = "Voice Room";
        if (publicId == null) publicId = "";
        if (country == null) country = "";
        createScreen();
        checkModerationSilently();
        refreshSeats();
        refreshMessages();
    }

    @Override protected void onResume() {
        super.onResume();
        resumed = true;
        ui.removeCallbacks(poll);
        ui.post(poll);
    }

    @Override protected void onPause() {
        resumed = false;
        ui.removeCallbacks(poll);
        super.onPause();
    }

    @Override protected void onDestroy() {
        ui.removeCallbacks(poll);
        api.close();
        avatarExecutor.shutdownNow();
        super.onDestroy();
    }

    private GradientDrawable surface(int a, int b, int corner, boolean border) {
        GradientDrawable d = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{a, b});
        d.setCornerRadius(dp(corner));
        if (border) d.setStroke(dp(1), GOLD);
        return d;
    }

    private GradientDrawable circle(int first, int second, boolean selected) {
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{first, second});
        g.setShape(GradientDrawable.OVAL);
        g.setStroke(dp(selected ? 3 : 1.5f), selected ? GOLD : Color.rgb(137, 116, 175));
        return g;
    }

    private TextView label(String value, int font, int color, boolean bold) {
        TextView v = new TextView(this);
        v.setText(value);
        v.setTextSize(font);
        v.setTextColor(color);
        v.setGravity(Gravity.CENTER_VERTICAL);
        if (bold) v.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return v;
    }

    private Button action(String title, boolean accented) {
        Button b = new Button(this);
        b.setAllCaps(false);
        b.setText(title);
        b.setTextSize(13);
        b.setTextColor(accented ? BG : WHITE);
        b.setBackground(surface(accented ? GOLD : PURPLE,
                accented ? Color.rgb(255, 224, 145) : Color.rgb(79, 48, 108), 14, !accented));
        b.setMinHeight(0);
        b.setMinimumHeight(0);
        b.setPadding(dp(5), 0, dp(5), 0);
        return b;
    }

    private LinearLayout vertical() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        return layout;
    }

    private LinearLayout horizontal() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.HORIZONTAL);
        layout.setGravity(Gravity.CENTER_VERTICAL);
        return layout;
    }

    private void createScreen() {
        boolean compact = height() < 530;
        LinearLayout root = vertical();
        root.setBackground(surface(BG, Color.rgb(29, 18, 52), 0, false));
        setContentView(root);

        LinearLayout header = horizontal();
        header.setPadding(dp(14), dp(compact ? 7 : 13), dp(14), dp(10));
        header.setBackground(surface(Color.rgb(31, 27, 62), PURPLE, 20, false));
        LinearLayout.LayoutParams hparams = new LinearLayout.LayoutParams(-1, dp(compact ? 75 : 92));
        hparams.setMargins(dp(9), dp(6), dp(9), dp(6));
        root.addView(header, hparams);

        TextView back = label("‹", 38, GOLD, false);
        back.setGravity(Gravity.CENTER);
        header.addView(back, new LinearLayout.LayoutParams(dp(36), -1));
        back.setOnClickListener(v -> leaveRoom());

        TextView crest = label("S", 27, GOLD, true);
        crest.setGravity(Gravity.CENTER);
        crest.setBackground(circle(Color.rgb(64, 44, 105), Color.rgb(19, 21, 56), true));
        header.addView(crest, new LinearLayout.LayoutParams(dp(47), dp(47)));

        LinearLayout titles = vertical();
        titles.setPadding(dp(12), 0, 0, 0);
        TextView eyebrow = label("SURA CHAT  ·  ROYAL LOUNGE", 10, TEAL, true);
        titles.addView(eyebrow);
        headerName = label(roomName, compact ? 16 : 19, WHITE, true);
        headerName.setSingleLine(true);
        headerName.setEllipsize(TextUtils.TruncateAt.END);
        titles.addView(headerName);
        liveLabel = label(country.isEmpty() ? "Voice room" : country + "  ·  Voice room", 11, MUTED, false);
        titles.addView(liveLabel);
        header.addView(titles, new LinearLayout.LayoutParams(0, -2, 1));

        TextView menu = label("⋮", 29, GOLD, true);
        menu.setGravity(Gravity.CENTER);
        menu.setBackground(surface(PURPLE, Color.rgb(87, 47, 100), 12, true));
        header.addView(menu, new LinearLayout.LayoutParams(dp(42), dp(44)));
        menu.setOnClickListener(v -> openRoomMenu());

        LinearLayout pinned = horizontal();
        pinned.setPadding(dp(12), dp(7), dp(12), dp(7));
        pinned.setBackground(surface(Color.rgb(50, 39, 72), Color.rgb(63, 42, 82), 12, false));
        LinearLayout.LayoutParams bannerParams = new LinearLayout.LayoutParams(-1, dp(compact ? 38 : 48));
        bannerParams.setMargins(dp(12), dp(2), dp(12), dp(7));
        root.addView(pinned, bannerParams);
        TextView horn = label("✦", 20, GOLD, true);
        pinned.addView(horn, new LinearLayout.LayoutParams(dp(30), -1));
        announcement = label("Room announcement will appear here", 12, WHITE, false);
        announcement.setMaxLines(2);
        announcement.setEllipsize(TextUtils.TruncateAt.END);
        pinned.addView(announcement, new LinearLayout.LayoutParams(0, -1, 1));

        ScrollView seatScroller = new ScrollView(this);
        seatScroller.setFillViewport(true);
        seatScroller.setVerticalScrollBarEnabled(false);
        root.addView(seatScroller, new LinearLayout.LayoutParams(-1, 0, 1));
        LinearLayout stage = vertical();
        stage.setPadding(dp(8), dp(6), dp(8), dp(8));
        seatScroller.addView(stage);
        LinearLayout stageTitle = horizontal();
        stageTitle.setPadding(dp(10), dp(2), dp(10), dp(3));
        stageTitle.addView(label("✧  THE ROYAL STAGE", 12, GOLD, true),
                new LinearLayout.LayoutParams(0, dp(34), 1));
        seatStatus = label("Select a seat to participate", 11, MUTED, false);
        seatStatus.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
        stageTitle.addView(seatStatus, new LinearLayout.LayoutParams(0, dp(34), 1));
        stage.addView(stageTitle);
        seatStage = vertical();
        seatStage.setBackground(surface(Color.rgb(26, 20, 52), Color.rgb(42, 31, 75), 25, false));
        seatStage.setPadding(dp(3), dp(7), dp(3), dp(8));
        stage.addView(seatStage, new LinearLayout.LayoutParams(-1, -2));
        stage.addView(label("♢  Seats update without reloading the room", 11, MUTED, false));

        LinearLayout chatBox = vertical();
        chatBox.setPadding(dp(10), dp(6), dp(10), dp(6));
        chatBox.setBackground(surface(Color.rgb(30, 26, 57), Color.rgb(36, 25, 64), 16, true));
        LinearLayout.LayoutParams chatParams = new LinearLayout.LayoutParams(-1, dp(compact ? 112 : 176));
        chatParams.setMargins(dp(8), dp(2), dp(8), dp(5));
        root.addView(chatBox, chatParams);

        LinearLayout chatTitle = horizontal();
        TextView heading = label("✉  ROOM CHAT", 12, GOLD, true);
        chatTitle.addView(heading, new LinearLayout.LayoutParams(0, dp(27), 1));
        TextView refresh = label("⟳ Refresh", 11, TEAL, false);
        refresh.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
        refresh.setOnClickListener(v -> { refreshSeats(); refreshMessages(); });
        chatTitle.addView(refresh);
        chatBox.addView(chatTitle);

        chatScroll = new ScrollView(this);
        chatScroll.setFillViewport(true);
        chatScroll.setVerticalScrollBarEnabled(false);
        chatHistory = label("Messages from this session appear here", 12, MUTED, false);
        chatHistory.setPadding(dp(5), dp(3), dp(5), dp(5));
        chatScroll.addView(chatHistory);
        chatBox.addView(chatScroll, new LinearLayout.LayoutParams(-1, 0, 1));

        LinearLayout composer = horizontal();
        chatInput = new EditText(this);
        chatInput.setSingleLine(true);
        chatInput.setTextColor(WHITE);
        chatInput.setHintTextColor(MUTED);
        chatInput.setTextSize(13);
        chatInput.setHint("Send a message…");
        chatInput.setFilters(new InputFilter[]{new InputFilter.LengthFilter(280)});
        chatInput.setPadding(dp(10), dp(3), dp(5), dp(3));
        chatInput.setBackground(surface(Color.rgb(38, 29, 65), Color.rgb(62, 42, 83), 13, false));
        composer.addView(chatInput, new LinearLayout.LayoutParams(0, dp(40), 1));
        sendButton = action("Send", true);
        LinearLayout.LayoutParams sendParams = new LinearLayout.LayoutParams(dp(70), dp(40));
        sendParams.setMargins(dp(6), 0, 0, 0);
        composer.addView(sendButton, sendParams);
        sendButton.setOnClickListener(v -> sendMessage());
        chatBox.addView(composer);

        LinearLayout footer = horizontal();
        footer.setPadding(dp(9), 0, dp(9), dp(5));
        footer.setBackgroundColor(BG);
        root.addView(footer, new LinearLayout.LayoutParams(-1, dp(compact ? 48 : 58)));
        String[] names = {"Chat", "Mic off", "Gifts", "Games", "More"};
        View.OnClickListener[] handlers = {
            v -> { chatInput.requestFocus(); },
            v -> checkVoice(),
            v -> showGiftPreview(),
            v -> info("Games", "Game integration is not yet installed in this staging build."),
            v -> openRoomMenu()
        };
        for (int i = 0; i < names.length; i++) {
            Button b = action(names[i], i == 1);
            b.setTextSize(compact ? 10 : 12);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(compact ? 42 : 49), 1);
            lp.setMargins(dp(2), 0, dp(2), 0);
            footer.addView(b, lp);
            b.setOnClickListener(handlers[i]);
        }
    }

    private void refreshSeats() {
        if (seatFetch || leaving) return;
        seatFetch = true;
        api.get("/api/v1/rooms/" + roomId + "/seats", (status, json) -> {
            seatFetch = false;
            if (isFinishing() || isDestroyed()) return;
            if (status != 200) {
                if (status == 401 || status == 403) info("Session", "Your login or room access has expired.");
                seatStatus.setText("Connection interrupted");
                return;
            }
            JSONObject room = json.optJSONObject("room");
            if (room != null) {
                String latestName = room.optString("name", roomName);
                if (!latestName.equals(roomName)) {
                    roomName = latestName;
                    headerName.setText(latestName);
                }
                String text = room.optString("announcement", "");
                if (!announcementText.equals(text)) {
                    announcementText = text;
                    announcement.setText(text.isEmpty() ? "Welcome to SURA CHAT · Be respectful" : text);
                }
                liveLabel.setText((country.isEmpty() ? "" : country + " · ") +
                        room.optString("status", "open").toUpperCase(Locale.ROOT) + " ROOM");
            }
            JSONArray seats = json.optJSONArray("seats");
            if (seats == null) return;
            String signature = seats.toString();
            if (signature.equals(lastSeatSnapshot)) return;
            lastSeatSnapshot = signature;
            mySeat = 0;
            for (int i = 0; i < seats.length(); i++) {
                JSONObject seat = seats.optJSONObject(i);
                if (seat != null && publicId.equals(seat.optString("public_id", "none"))) {
                    mySeat = seat.optInt("seat_number", 0);
                }
            }
            seatStatus.setText(mySeat == 0 ? "Choose an empty seat" : "Your seat: " + mySeat);
            renderSeatGrid(seats);
        });
    }

    private void renderSeatGrid(JSONArray seats) {
        seatStage.removeAllViews();
        LinearLayout row = null;
        int maxSeatDiameter = Math.min(66, Math.max(45, (width() - 70) / 4 - 12));
        for (int i = 0; i < seats.length(); i++) {
            JSONObject seat = seats.optJSONObject(i);
            if (seat == null) continue;
            if (i % 4 == 0) {
                row = horizontal();
                row.setGravity(Gravity.TOP | Gravity.CENTER_HORIZONTAL);
                seatStage.addView(row, new LinearLayout.LayoutParams(-1, dp(maxSeatDiameter + 57)));
            }
            final int number = seat.optInt("seat_number", i + 1);
            boolean locked = seat.optInt("is_locked") == 1;
            String occupant = seat.isNull("display_name") ? "" : seat.optString("display_name", "");
            String userId = seat.isNull("public_id") ? "" : seat.optString("public_id", "");
            String avatarKey = seat.isNull("avatar_key") ? "" : seat.optString("avatar_key", "");
            boolean taken = !userId.isEmpty();
            boolean mine = taken && publicId.equals(userId);

            LinearLayout column = vertical();
            column.setGravity(Gravity.TOP | Gravity.CENTER_HORIZONTAL);
            if (row != null) row.addView(column, new LinearLayout.LayoutParams(0, -2, 1));

            FrameLayout avatarHolder = new FrameLayout(this);
            LinearLayout.LayoutParams frameParams = new LinearLayout.LayoutParams(dp(maxSeatDiameter), dp(maxSeatDiameter));
            frameParams.setMargins(0, dp(5), 0, dp(3));
            column.addView(avatarHolder, frameParams);

            TextView avatar = label(locked ? "🔒" : taken ? initials(occupant) : "+", taken ? 22 : 25,
                    taken ? GOLD : MUTED, true);
            avatar.setGravity(Gravity.CENTER);
            avatar.setBackground(circle(locked ? Color.rgb(46, 40, 66) : taken ? Color.rgb(103, 61, 139) : Color.rgb(39, 32, 65),
                    taken ? Color.rgb(54, 41, 91) : Color.rgb(23, 23, 50), mine));
            avatarHolder.addView(avatar, new FrameLayout.LayoutParams(-1, -1));
            if (taken && !avatarKey.isEmpty()) loadAvatar(avatarHolder, userId, avatarKey, maxSeatDiameter);

            TextView seatTitle = label(taken ? occupant : locked ? "Locked" : "Seat " + number, 11,
                    mine ? GOLD : WHITE, mine);
            seatTitle.setGravity(Gravity.CENTER);
            seatTitle.setSingleLine(true);
            seatTitle.setEllipsize(TextUtils.TruncateAt.END);
            column.addView(seatTitle, new LinearLayout.LayoutParams(-1, dp(19)));

            TextView idLine = label(taken ? userId : mine ? "You" : "✧", 10, MUTED, false);
            idLine.setGravity(Gravity.CENTER);
            column.addView(idLine, new LinearLayout.LayoutParams(-1, dp(18)));

            View.OnClickListener click = v -> {
                if (seatRequest || leaving) return;
                if (taken) showUserPopup(userId, occupant, number);
                else if (locked) { if (moderator) toggleLock(number, false); else toast("This seat is locked"); }
                else if (mySeat != 0) toast("Stand first to change seats");
                else takeSeat(number);
            };
            column.setOnClickListener(click);
            avatarHolder.setOnClickListener(click);
            column.setOnLongClickListener(v -> {
                if (moderator) {
                    if (!taken) toggleLock(number, !locked);
                    else showUserPopup(userId, occupant, number);
                    return true;
                }
                return false;
            });
        }
    }

    private String initials(String name) {
        String cleaned = name == null ? "" : name.trim();
        if (cleaned.isEmpty()) return "✦";
        return cleaned.substring(0, Math.min(cleaned.length(), 2)).toUpperCase(Locale.ROOT);
    }

    private void loadAvatar(FrameLayout holder, String memberId, String key, int size) {
        final String cacheKey = memberId + ":" + key;
        holder.setTag(cacheKey);
        Bitmap cached;
        synchronized (avatarCache) { cached = avatarCache.get(cacheKey); }
        if (cached != null) { showAvatar(holder, cached, cacheKey, size); return; }
        avatarExecutor.execute(() -> {
            HttpURLConnection conn = null;
            Bitmap bmp = null;
            try {
                if (!memberId.matches("[0-9]{7,8}")) return;
                conn = (HttpURLConnection) new URL(BuildConfig.API_BASE_URL +
                        "/api/v1/users/" + memberId + "/avatar").openConnection();
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);
                conn.setInstanceFollowRedirects(false);
                if (conn.getResponseCode() != 200 || conn.getContentLength() > 256000) return;
                try (InputStream stream = conn.getInputStream()) {
                    bmp = BitmapFactory.decodeStream(stream);
                }
            } catch (Exception ignored) {
            } finally { if (conn != null) conn.disconnect(); }
            if (bmp == null) return;
            final Bitmap found = bmp;
            synchronized (avatarCache) { avatarCache.put(cacheKey, found); }
            ui.post(() -> {
                if (!isFinishing() && !isDestroyed()) showAvatar(holder, found, cacheKey, size);
            });
        });
    }

    private void showAvatar(FrameLayout holder, Bitmap bitmap, String key, int size) {
        if (!key.equals(holder.getTag())) return;
        if (holder.getChildCount() > 1) return;
        ImageView photo = new ImageView(this);
        photo.setScaleType(ImageView.ScaleType.CENTER_CROP);
        photo.setBackground(circle(Color.rgb(68, 44, 100), Color.rgb(45, 30, 70), false));
        photo.setClipToOutline(true);
        photo.setImageBitmap(bitmap);
        holder.addView(photo, new FrameLayout.LayoutParams(-1, -1));
    }

    private void takeSeat(int number) {
        seatRequest = true;
        seatStatus.setText("Selecting seat…");
        api.post("/api/v1/rooms/" + roomId + "/seats/" + number, new JSONObject(), (status, result) -> {
            seatRequest = false;
            if (status != 200) showError(status, result);
            refreshSeats();
        });
    }

    private void stand() {
        api.post("/api/v1/rooms/" + roomId + "/stand", new JSONObject(), (status, json) -> {
            if (status != 200) showError(status, json);
            else { toast("Seat left"); refreshSeats(); }
        });
    }

    private void refreshMessages() {
        if (chatFetch || leaving) return;
        chatFetch = true;
        api.get("/api/v1/rooms/" + roomId + "/messages?after=" + lastMessageId, (status, json) -> {
            chatFetch = false;
            if (isFinishing() || isDestroyed()) return;
            if (status != 200) return;
            JSONArray messages = json.optJSONArray("messages");
            if (messages == null || messages.length() == 0) return;
            for (int i = 0; i < messages.length(); i++) {
                JSONObject m = messages.optJSONObject(i);
                if (m == null) continue;
                lastMessageId = Math.max(lastMessageId, m.optInt("id", lastMessageId));
                String name = m.optString("sender_name", "System");
                if (name.isEmpty() || "null".equals(name)) name = "System";
                String message = m.optString("body", "").replace('\n', ' ');
                chatLines.addLast(name + ": " + message);
                while (chatLines.size() > 45) chatLines.removeFirst();
            }
            chatHistory.setText(TextUtils.join("\n", chatLines));
            chatScroll.post(() -> chatScroll.fullScroll(View.FOCUS_DOWN));
        });
    }

    private void sendMessage() {
        String message = chatInput.getText().toString().trim();
        if (message.isEmpty()) return;
        if (message.length() > 280) { toast("Message too long"); return; }
        try {
            sendButton.setEnabled(false);
            api.post("/api/v1/rooms/" + roomId + "/messages",
                    new JSONObject().put("message", message), (status, json) -> {
                sendButton.setEnabled(true);
                if (status != 201 && status != 200) { showError(status, json); return; }
                if (chatInput.getText().toString().trim().equals(message)) chatInput.setText("");
                refreshMessages();
            });
        } catch (Exception e) {
            sendButton.setEnabled(true);
            toast("Unable to send");
        }
    }

    private void checkModerationSilently() {
        api.get("/api/v1/rooms/" + roomId + "/manage", (status, json) -> {
            if (status != 200 || isFinishing()) return;
            moderator = true;
            owner = "owner".equals(json.optString("my_permission"));
        });
    }

    private void openRoomMenu() {
        String[] commands = moderator
                ? new String[]{"Refresh room", "Stand from seat", "Room management", "Gift catalog", "Leave room"}
                : new String[]{"Refresh room", "Stand from seat", "Gift catalog", "Leave room"};
        new AlertDialog.Builder(this).setTitle("Room actions")
                .setItems(commands, (dlg, choice) -> {
                    String cmd = commands[choice];
                    if ("Refresh room".equals(cmd)) { refreshSeats(); refreshMessages(); }
                    else if ("Stand from seat".equals(cmd)) stand();
                    else if ("Room management".equals(cmd)) loadManagement();
                    else if ("Gift catalog".equals(cmd)) showGiftPreview();
                    else if ("Leave room".equals(cmd)) leaveRoom();
                }).show();
    }

    private void loadManagement() {
        api.get("/api/v1/rooms/" + roomId + "/manage", (status, json) -> {
            if (status != 200) { showError(status, json); return; }
            moderator = true;
            owner = "owner".equals(json.optString("my_permission"));
            JSONObject room = json.optJSONObject("room");
            if (room == null) return;
            String[] choices = owner
                ? new String[]{"Edit room name, seats, announcement and lock",
                    "Assign room moderator", "Remove room moderator",
                    "Unblock member", "View active members", "View blocked members"}
                : new String[]{"Moderator tools guide", "Unblock member",
                    "View active members", "View blocked members"};
            new AlertDialog.Builder(this)
                .setTitle(owner ? "Owner · Room Management" : "Room Moderator")
                .setItems(choices, (dialog, selected) -> {
                    String item = choices[selected];
                    if (item.startsWith("Edit room")) showSettingsEditor(room);
                    else if (item.equals("Assign room moderator")) memberIdAction("assign");
                    else if (item.equals("Remove room moderator")) memberIdAction("remove");
                    else if (item.equals("Unblock member")) memberIdAction("unblock");
                    else if (item.equals("View active members")) showMemberList(json.optJSONArray("members"));
                    else if (item.equals("View blocked members")) showMemberList(json.optJSONArray("bans"));
                    else info("Moderator controls", "Tap an occupied seat to view a member or kick/block them. Long-press an empty seat to lock or unlock it.");
                }).show();
        });
    }

    private void showMemberList(JSONArray people) {
        if (people == null || people.length() == 0) {
            info("Room members", "No members found in this list.");
            return;
        }
        StringBuilder listing = new StringBuilder();
        for (int i = 0; i < people.length(); i++) {
            JSONObject p = people.optJSONObject(i);
            if (p == null) continue;
            listing.append("✦ ").append(p.optString("display_name", "User"))
                   .append("  #").append(p.optString("public_id", ""))
                   .append("  ").append(p.optString("permission", ""))
                   .append("\n");
        }
        info("Room members", listing.toString());
    }

    private void memberIdAction(String actionType) {
        EditText memberId = new EditText(this);
        memberId.setInputType(InputType.TYPE_CLASS_NUMBER);
        memberId.setHint("7-digit member ID");
        memberId.setSingleLine(true);
        memberId.setFilters(new InputFilter[]{new InputFilter.LengthFilter(8)});
        String title = "assign".equals(actionType) ? "Assign room moderator" :
                       "remove".equals(actionType) ? "Remove room moderator" : "Unblock member";
        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle(title).setView(memberId)
                .setNegativeButton("Cancel", null).setPositiveButton("Confirm", null).create();
        dialog.setOnShowListener(ignored -> dialog.getButton(DialogInterface.BUTTON_POSITIVE).setOnClickListener(v -> {
            String id = memberId.getText().toString().trim();
            if (!id.matches("[0-9]{7,8}")) { toast("Enter a valid member ID"); return; }
            try {
                JSONObject body = new JSONObject().put("public_id", id);
                String path;
                if ("unblock".equals(actionType)) {
                    path = "/api/v1/rooms/" + roomId + "/unblock";
                } else {
                    path = "/api/v1/rooms/" + roomId + "/moderators";
                    body.put("enabled", "assign".equals(actionType));
                }
                dialog.getButton(DialogInterface.BUTTON_POSITIVE).setEnabled(false);
                api.post(path, body, (code, json) -> {
                    dialog.getButton(DialogInterface.BUTTON_POSITIVE).setEnabled(true);
                    if (code != 200) showError(code, json);
                    else {
                        dialog.dismiss();
                        toast(title + " · done");
                        checkModerationSilently();
                    }
                });
            } catch (Exception invalidRequest) { toast("Invalid request"); }
        }));
        dialog.show();
    }

    private EditText edit(LinearLayout parent, String hint, String value) {
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setTextSize(15);
        input.setHint(hint);
        input.setText(value);
        input.setTextColor(WHITE);
        input.setHintTextColor(MUTED);
        parent.addView(input, new LinearLayout.LayoutParams(-1, dp(52)));
        return input;
    }

    private void showSettingsEditor(JSONObject room) {
        LinearLayout fields = vertical();
        fields.setPadding(dp(22), dp(8), dp(22), dp(8));
        fields.setBackgroundColor(BG);
        EditText title = edit(fields, "Room name", room.optString("name", roomName));
        EditText notice = edit(fields, "Pinned announcement", room.optString("announcement", ""));
        EditText count = edit(fields, "Seat count: 4, 8, 12, 16", room.optString("seat_count", "8"));
        count.setInputType(InputType.TYPE_CLASS_NUMBER);
        String[] statuses = {"open", "locked"};
        int selected = "locked".equals(room.optString("status")) ? 1 : 0;
        final int[] chosen = {selected};
        TextView state = label("Room status: " + statuses[selected] + " (tap to toggle)", 14, GOLD, true);
        state.setPadding(0, dp(12), 0, dp(12));
        state.setOnClickListener(v -> {
            chosen[0] = 1 - chosen[0];
            state.setText("Room status: " + statuses[chosen[0]] + " (tap to toggle)");
        });
        fields.addView(state);
        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Owner · Room settings")
                .setView(fields)
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Save", null)
                .create();
        dialog.setOnShowListener(d -> dialog.getButton(DialogInterface.BUTTON_POSITIVE).setOnClickListener(v -> {
            String nextName = title.getText().toString().trim();
            String nextNotice = notice.getText().toString().trim();
            String nextCount = count.getText().toString().trim();
            if (nextName.length() < 3 || nextName.length() > 64 || nextNotice.length() > 400 ||
                    !("4".equals(nextCount) || "8".equals(nextCount) ||
                      "12".equals(nextCount) || "16".equals(nextCount))) {
                toast("Use 3–64 letter name, max 400 announcement characters, and 4/8/12/16 seats");
                return;
            }
            try {
                JSONObject body = new JSONObject()
                    .put("name", nextName)
                    .put("announcement", nextNotice)
                    .put("seat_count", Integer.parseInt(nextCount))
                    .put("status", statuses[chosen[0]]);
                api.post("/api/v1/rooms/" + roomId + "/settings", body, (status, json) -> {
                    if (status != 200) { showError(status, json); return; }
                    dialog.dismiss();
                    lastSeatSnapshot = "";
                    refreshSeats();
                    toast("Room settings saved");
                });
            } catch (Exception ignored) { toast("Invalid settings"); }
        }));
        dialog.show();
    }

    private void toggleLock(int number, boolean locked) {
        String verb = locked ? "lock" : "unlock";
        api.post("/api/v1/rooms/" + roomId + "/seats/" + number + "/" + verb,
                new JSONObject(), (code, json) -> {
            if (code != 200) showError(code, json);
            else { lastSeatSnapshot = ""; refreshSeats(); }
        });
    }

    private void showUserPopup(String targetId, String name, int number) {
        if (targetId.equals(publicId)) {
            new AlertDialog.Builder(this).setTitle("Your seat · " + number)
                    .setItems(new String[]{"Stand from seat", "Cancel"}, (d, which) -> {
                        if (which == 0) stand();
                    }).show();
            return;
        }
        String[] actions = moderator
                ? new String[]{"View profile", "Private message", "Kick from room", "Block from room"}
                : new String[]{"View profile", "Private message"};
        new AlertDialog.Builder(this)
                .setTitle(name + "  ·  ID " + targetId)
                .setItems(actions, (dialog, selected) -> {
                    if (selected == 0) fetchMember(targetId);
                    else if (selected == 1) privateMessage(targetId);
                    else if (selected == 2) confirmModeration(targetId, "kick");
                    else if (selected == 3) confirmModeration(targetId, "block");
                }).show();
    }

    private void fetchMember(String id) {
        api.get("/api/v1/users/" + id, (status, json) -> {
            if (status != 200) { showError(status, json); return; }
            JSONObject user = json.optJSONObject("user");
            if (user == null) return;
            info(user.optString("display_name", "Member"),
                    "ID: " + user.optString("public_id", "") +
                    "\nCountry: " + user.optString("country_code", "") +
                    "\nBio: " + user.optString("bio", ""));
        });
    }

    private void privateMessage(String targetId) {
        EditText message = new EditText(this);
        message.setHint("Write a private message");
        message.setSingleLine(false);
        message.setMaxLines(4);
        message.setFilters(new InputFilter[]{new InputFilter.LengthFilter(500)});
        new AlertDialog.Builder(this).setTitle("Message · " + targetId)
                .setView(message).setNegativeButton("Cancel", null)
                .setPositiveButton("Send", (d, which) -> {
                    String body = message.getText().toString().trim();
                    if (body.isEmpty()) return;
                    try {
                        api.post("/api/v1/messages/" + targetId,
                                new JSONObject().put("message", body), (code, json) -> {
                            if (code == 201) toast("Private message sent");
                            else showError(code, json);
                        });
                    } catch (Exception ignored) { }
                }).show();
    }

    private void confirmModeration(String targetId, String action) {
        new AlertDialog.Builder(this)
                .setTitle(action.equals("block") ? "Block member?" : "Kick member?")
                .setMessage("User ID " + targetId + " · This will remove them from the room.")
                .setNegativeButton("Cancel", null)
                .setPositiveButton(action.toUpperCase(Locale.ROOT), (d, which) -> {
                    try {
                        api.post("/api/v1/rooms/" + roomId + "/" + action,
                                new JSONObject().put("public_id", targetId), (code, json) -> {
                            if (code != 200) showError(code, json);
                            else { refreshSeats(); toast("Member " + action + "ed"); }
                        });
                    } catch (Exception ignored) { }
                }).show();
    }

    private void checkVoice() {
        api.get("/api/v1/rooms/" + roomId + "/voice/status", (status, json) -> {
            if (status != 200) { showError(status, json); return; }
            String role = json.optString("role", "listener");
            String seat = json.isNull("seat") ? "none" : json.optString("seat", "none");
            String message = "Current seat: " + seat + "\nServer role: " + role +
                    "\nThis Android build has no connected RTC SDK. Microphone is not transmitting audio.";
            info("Voice status · Not connected", message);
        });
    }

    private void showGiftPreview() {
        api.get("/api/v1/gifts?limit=30", (status, json) -> {
            if (status != 200) { showError(status, json); return; }
            JSONArray items = json.optJSONArray("gifts");
            if (items == null || items.length() == 0) {
                info("Gift catalog", "No active gifts are available.");
                return;
            }
            StringBuilder lines = new StringBuilder();
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                if (item == null) continue;
                lines.append("✦ ").append(item.optString("name", "Gift"))
                     .append("  ·  ").append(item.optLong("price_coins"))
                     .append(" coins\n");
            }
            info("Gift catalog · Preview only", lines + "\nSending gifts is disabled until wallet ledger tests pass.");
        });
    }

    private void leaveRoom() {
        if (leaving) return;
        leaving = true;
        ui.removeCallbacks(poll);
        api.post("/api/v1/rooms/" + roomId + "/leave", new JSONObject(), (status, json) -> {
            if (status == 200) { setResult(RESULT_OK); finish(); }
            else {
                leaving = false;
                showError(status, json);
                if (resumed) ui.post(poll);
            }
        });
    }

    private void showError(int code, JSONObject json) {
        String reason = json.optString("error", "unknown_error");
        toast((code == 0 ? "Network error · " : "Error " + code + " · ") + reason);
    }
    private void toast(String value) { Toast.makeText(this, value, Toast.LENGTH_SHORT).show(); }
    private void info(String title, String message) {
        new AlertDialog.Builder(this).setTitle(title).setMessage(message)
                .setPositiveButton("OK", null).show();
    }

    @Override public void onBackPressed() { leaveRoom(); }
}
