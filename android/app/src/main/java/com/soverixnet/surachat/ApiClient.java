package com.soverixnet.surachat;

import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Small HTTPS JSON client. Session token is memory-only in this prototype. */
public final class ApiClient {
    public interface Callback { void complete(int status, JSONObject result); }
    private final ExecutorService executor = Executors.newFixedThreadPool(3);
    private final Handler main = new Handler(Looper.getMainLooper());
    private String bearer = "";

    public void setSession(String token) { bearer = token == null ? "" : token; }
    public boolean signedIn() { return !bearer.isEmpty(); }

    public void get(String path, Callback callback) { request("GET", path, null, callback); }
    public void post(String path, JSONObject body, Callback callback) { request("POST", path, body, callback); }

    private void request(String method, String path, JSONObject body, Callback callback) {
        final String authSnapshot = bearer;
        executor.execute(() -> {
            int status = 0;
            JSONObject result = new JSONObject();
            HttpURLConnection connection = null;
            try {
                if (BuildConfig.API_BASE_URL.isEmpty()) throw new IOException("api_unconfigured_for_release");
                if (!path.startsWith("/") || path.startsWith("//")) throw new IOException("bad_endpoint");
                connection = (HttpURLConnection) new URL(BuildConfig.API_BASE_URL + path).openConnection();
                connection.setRequestMethod(method);
                connection.setConnectTimeout(8000);
                connection.setReadTimeout(12000);
                connection.setInstanceFollowRedirects(false);
                connection.setRequestProperty("Accept", "application/json");
                if (!authSnapshot.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + authSnapshot);
                if (body != null) {
                    byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                    connection.setDoOutput(true);
                    connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                    try (OutputStream os = connection.getOutputStream()) { os.write(bytes); }
                }
                status = connection.getResponseCode();
                InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                if (stream != null) {
                    try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                        byte[] buffer = new byte[2048];
                        int n;
                        while ((n = input.read(buffer)) != -1) {
                            if (output.size() + n > 262144) throw new IOException("response_too_large");
                            output.write(buffer, 0, n);
                        }
                        result = new JSONObject(output.toString(StandardCharsets.UTF_8.name()));
                    }
                }
            } catch (Exception e) {
                status = 0;
                try { result.put("error", e.getMessage() == null ? "network_error" : e.getMessage()); }
                catch (Exception ignored) { }
            } finally { if (connection != null) connection.disconnect(); }
            final int code = status;
            final JSONObject json = result;
            main.post(() -> callback.complete(code, json));
        });
    }
}
