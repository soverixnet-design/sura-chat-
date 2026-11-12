package com.soverixnet.surachat;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Reusable, responsive visual components. Content and actions come from the SURA API. */
public final class RoyalTheme {
    private RoyalTheme() {}
    public static final int NAVY = Color.rgb(13, 11, 35);
    public static final int PANEL = Color.rgb(43, 20, 70);
    public static final int PANEL_DARK = Color.rgb(27, 18, 53);
    public static final int GOLD = Color.rgb(246, 199, 107);
    public static final int CREAM = Color.rgb(255, 246, 226);
    public static final int MUTED = Color.rgb(192, 179, 211);
    public static final int PURPLE = Color.rgb(168, 88, 225);
    public static int dp(Context c, float amount) {
        return (int)(c.getResources().getDisplayMetrics().density * amount + .5f);
    }
    public static GradientDrawable bg(Context c, boolean goldEdge, int radius) {
        GradientDrawable d = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
            new int[]{Color.rgb(60, 28, 85), PANEL_DARK, Color.rgb(29, 14, 52)});
        d.setCornerRadius(dp(c,radius));
        d.setStroke(dp(c, 1), goldEdge ? GOLD : Color.rgb(127, 73, 165));
        return d;
    }
    public static GradientDrawable goldButton(Context c) {
        GradientDrawable d = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
            new int[]{Color.rgb(255, 227, 155), Color.rgb(228, 163, 66)});
        d.setCornerRadius(dp(c,24));
        d.setStroke(dp(c,1),Color.rgb(255, 239, 191));
        return d;
    }
    public static TextView text(Context c, String value, int sp, int color, boolean bold) {
        TextView t = new TextView(c);
        t.setText(value);
        t.setTextSize(sp);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER_VERTICAL);
        if (bold) t.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        t.setIncludeFontPadding(true);
        return t;
    }
    public static LinearLayout hero(Context c, String eyebrow, String title, String subtitle, String drawable) {
        LinearLayout body = new LinearLayout(c);
        body.setOrientation(LinearLayout.HORIZONTAL);
        body.setGravity(Gravity.CENTER_VERTICAL);
        body.setPadding(dp(c,17),dp(c,14),dp(c,12),dp(c,14));
        body.setBackground(bg(c,true,22));
        body.setElevation(dp(c,3));
        LinearLayout words = new LinearLayout(c);
        words.setOrientation(LinearLayout.VERTICAL);
        words.addView(text(c,eyebrow,11,GOLD,true));
        TextView heading = text(c,title,22,CREAM,true);
        heading.setMaxLines(2);
        words.addView(heading);
        TextView sub = text(c,subtitle,12,MUTED,false);
        sub.setMaxLines(3);
        words.addView(sub);
        body.addView(words,new LinearLayout.LayoutParams(0,-2,1));
        String artwork = "sura_voice_support".equals(drawable) ? "sura_royal_hero" : drawable;
        int artWidth = "sura_royal_hero".equals(artwork) ? 128 : 100;
        body.addView(RoyalIcons.view(c,artwork,artWidth,"✦"),
            new LinearLayout.LayoutParams(dp(c,artWidth),dp(c,109)));
        return body;
    }
    public static LinearLayout title(Context c, String name, String hint) {
        LinearLayout l = new LinearLayout(c);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setPadding(dp(c,4),dp(c,17),dp(c,4),dp(c,7));
        l.addView(text(c,name,20,GOLD,true));
        if (hint != null && !hint.isEmpty()) l.addView(text(c,hint,12,MUTED,false));
        return l;
    }
    public static LinearLayout framed(Context c) {
        LinearLayout l = new LinearLayout(c);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setPadding(dp(c,14),dp(c,12),dp(c,14),dp(c,12));
        l.setBackground(bg(c,true,18));
        return l;
    }
    public static LinearLayout.LayoutParams margins(Context c, int height, int sides, int top, int bottom) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1,height<0?height:dp(c,height));
        p.setMargins(dp(c,sides),dp(c,top),dp(c,sides),dp(c,bottom));
        return p;
    }
    public static void displaySection(LinearLayout parent, Context c, String section, String description) {
        parent.addView(title(c,section,description));
    }
    public static TextView avatar(Context c, String initials) {
        TextView t = text(c,initials,21,GOLD,true);
        t.setGravity(Gravity.CENTER);
        GradientDrawable d = bg(c,true,60);
        d.setShape(GradientDrawable.OVAL);
        t.setBackground(d);
        return t;
    }
    public static String initials(String input) {
        if (input==null || input.trim().isEmpty()) return "✦";
        String[] words=input.trim().split("\\s+");
        return (words[0].substring(0,1) + (words.length>1 ? words[words.length-1].substring(0,1):"")).toUpperCase(java.util.Locale.ROOT);
    }
}
