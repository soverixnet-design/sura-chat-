package com.soverixnet.surachat;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.TextView;

/**
 * Staging-only image helper for user-supplied Royal Premium 3D artwork.
 * Android resource names are looked up dynamically so staging continues to
 * compile even when image assets have not yet been copied into drawable-nodpi.
 * No remote image downloads, billing, wallet or audio side effects.
 */
public final class RoyalIcons {
    private RoyalIcons() {}

    private static int dp(Context ctx, int value) {
        return (int) (ctx.getResources().getDisplayMetrics().density * value + .5f);
    }

    private static int drawableId(Context ctx, String resource) {
        if (resource == null || !resource.matches("sura_[a-z_]+")) return 0;
        return ctx.getResources().getIdentifier(resource, "drawable", ctx.getPackageName());
    }

    public static View view(Context ctx, String resource, int sizeDp, String fallback) {
        int id = drawableId(ctx, resource);
        if (id == 0) {
            TextView label = new TextView(ctx);
            label.setText(fallback);
            label.setGravity(Gravity.CENTER);
            label.setTextColor(Color.rgb(233, 190, 104));
            label.setTextSize(24);
            label.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
            return label;
        }
        ImageView image = new ImageView(ctx);
        image.setImageResource(id);
        image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        image.setContentDescription(resource.replace("sura_", "").replace('_', ' '));
        image.setAdjustViewBounds(false);
        return image;
    }

    public static void decorateButton(Context ctx, Button button, String resource, int sizeDp, boolean aboveText) {
        int id = drawableId(ctx, resource);
        if (id == 0) return;
        Drawable drawable = ctx.getDrawable(id);
        if (drawable == null) return;
        drawable.setBounds(0, 0, dp(ctx, sizeDp), dp(ctx, sizeDp));
        if (aboveText) {
            button.setCompoundDrawables(null, drawable, null, null);
            button.setCompoundDrawablePadding(0);
        } else {
            button.setCompoundDrawables(drawable, null, null, null);
            button.setCompoundDrawablePadding(dp(ctx, 7));
        }
        button.setGravity(Gravity.CENTER);
    }
}
