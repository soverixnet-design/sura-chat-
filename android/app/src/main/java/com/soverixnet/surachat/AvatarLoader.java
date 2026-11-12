package com.soverixnet.surachat;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.GradientDrawable;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;
import android.view.ViewGroup;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.lang.ref.WeakReference;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Loads only the user's published avatar from SURA's own HTTPS staging API. */
public final class AvatarLoader {
    private AvatarLoader() {}
    private static final ExecutorService pool=Executors.newFixedThreadPool(2);
    private static final Handler main=new Handler(Looper.getMainLooper());
    public static void render(Context context, FrameLayout holder, String id, String name, String avatarKey, int sizeDp) {
        holder.removeAllViews();
        holder.setTag(id+":"+avatarKey);
        TextView fallback=RoyalTheme.avatar(context,RoyalTheme.initials(name));
        holder.addView(fallback,new FrameLayout.LayoutParams(-1,-1));
        if (avatarKey==null || avatarKey.isEmpty() || !id.matches("[0-9]{7,8}")) return;
        final String key=id+":"+avatarKey;
        WeakReference<FrameLayout> target=new WeakReference<>(holder);
        pool.execute(() -> {
            HttpURLConnection connection=null;
            Bitmap avatar=null;
            try {
                if(BuildConfig.API_BASE_URL.isEmpty())return;
                connection=(HttpURLConnection)new URL(BuildConfig.API_BASE_URL+"/api/v1/users/"+id+"/avatar").openConnection();
                connection.setConnectTimeout(5000);
                connection.setReadTimeout(5000);
                connection.setInstanceFollowRedirects(false);
                if(connection.getResponseCode()!=200 || connection.getContentLength()>256000)return;
                try(InputStream stream=connection.getInputStream()){
                    avatar=BitmapFactory.decodeStream(stream);
                }
            }catch(Exception ignored){}
            finally{if(connection!=null)connection.disconnect();}
            if(avatar==null)return;
            Bitmap result=avatar;
            main.post(()->{
                FrameLayout dest=target.get();
                if(dest==null || !key.equals(dest.getTag()))return;
                ImageView photo=new ImageView(dest.getContext());
                photo.setScaleType(ImageView.ScaleType.CENTER_CROP);
                GradientDrawable border=new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                        new int[]{Color.rgb(79,45,115),Color.rgb(32,24,64)});
                border.setShape(GradientDrawable.OVAL);
                border.setStroke(RoyalTheme.dp(dest.getContext(),2),RoyalTheme.GOLD);
                photo.setBackground(border);
                photo.setClipToOutline(true);
                photo.setImageBitmap(result);
                dest.addView(photo,new FrameLayout.LayoutParams(-1,-1));
            });
        });
    }
}
