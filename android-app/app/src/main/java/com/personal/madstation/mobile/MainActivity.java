package com.personal.madstation.mobile;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private FrameLayout root;
    private WebView homeWebView;
    private WebView browserWebView;
    private LinearLayout browserScreen;
    private TextView addressLabel;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        root = new FrameLayout(this);

        homeWebView = new WebView(this);
        configureWebView(homeWebView, false);
        homeWebView.addJavascriptInterface(new HomeBridge(), "MadStation");
        homeWebView.loadUrl("file:///android_asset/index.html");
        root.addView(homeWebView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        buildBrowserScreen();
        root.addView(browserScreen, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        browserScreen.setVisibility(View.GONE);

        setContentView(root);
    }

    private void buildBrowserScreen() {
        browserScreen = new LinearLayout(this);
        browserScreen.setOrientation(LinearLayout.VERTICAL);
        browserScreen.setBackgroundColor(0xFFFFFFFF);

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(6), dp(4), dp(6), dp(4));
        toolbar.setBackgroundColor(0xFFF4F5F7);

        Button backButton = toolbarButton("‹");
        backButton.setContentDescription("Back");
        backButton.setOnClickListener(v -> {
            if (browserWebView != null && browserWebView.canGoBack()) {
                browserWebView.goBack();
            } else {
                showHome();
            }
        });

        Button homeButton = toolbarButton("⌂");
        homeButton.setContentDescription("Home");
        homeButton.setOnClickListener(v -> showHome());

        addressLabel = new TextView(this);
        addressLabel.setText("Opening website…");
        addressLabel.setTextSize(12);
        addressLabel.setTypeface(Typeface.DEFAULT, Typeface.NORMAL);
        addressLabel.setTextColor(0xFF30343B);
        addressLabel.setSingleLine(true);
        addressLabel.setGravity(Gravity.CENTER_VERTICAL);
        addressLabel.setPadding(dp(8), 0, dp(8), 0);
        toolbar.addView(backButton, new LinearLayout.LayoutParams(dp(42), dp(44)));
        toolbar.addView(homeButton, new LinearLayout.LayoutParams(dp(42), dp(44)));
        toolbar.addView(addressLabel, new LinearLayout.LayoutParams(0, dp(44), 1f));

        Button externalButton = toolbarButton("↗");
        externalButton.setContentDescription("Open in browser");
        externalButton.setOnClickListener(v -> openCurrentInExternalBrowser());
        toolbar.addView(externalButton, new LinearLayout.LayoutParams(dp(42), dp(44)));

        browserScreen.addView(toolbar, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(52)));

        browserWebView = new WebView(this);
        configureWebView(browserWebView, true);
        browserScreen.addView(browserWebView, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
    }

    private Button toolbarButton(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextSize(22);
        button.setAllCaps(false);
        button.setPadding(0, 0, 0, 0);
        return button;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void configureWebView(WebView webView, boolean isBrowser) {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        settings.setSupportMultipleWindows(false);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
                if ("https".equals(scheme)) {
                    return false;
                }
                if ("http".equals(scheme) && isBrowser) {
                    return false;
                }
                if (isBrowser && ("mailto".equals(scheme) || "tel".equals(scheme))) {
                    launchExternal(uri);
                }
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                if (isBrowser) updateAddress(url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (isBrowser) updateAddress(url);
            }
        });
    }

    private void updateAddress(String url) {
        if (addressLabel == null) return;
        Uri uri = Uri.parse(url);
        String host = uri.getHost();
        addressLabel.setText(host == null ? "Website" : host);
    }

    private void openBrowser(String url) {
        Uri uri = Uri.parse(url == null ? "" : url.trim());
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null) {
            Toast.makeText(this, "Only secure HTTPS websites can be opened in-app.", Toast.LENGTH_LONG).show();
            return;
        }
        browserScreen.setVisibility(View.VISIBLE);
        homeWebView.setVisibility(View.GONE);
        browserWebView.loadUrl(uri.toString());
    }

    private void showHome() {
        if (browserScreen != null) browserScreen.setVisibility(View.GONE);
        if (homeWebView != null) homeWebView.setVisibility(View.VISIBLE);
    }

    private void openCurrentInExternalBrowser() {
        if (browserWebView == null) return;
        String url = browserWebView.getUrl();
        if (url != null && url.startsWith("https://")) {
            launchExternal(Uri.parse(url));
        } else {
            Toast.makeText(this, "No secure website is open.", Toast.LENGTH_SHORT).show();
        }
    }

    private void launchExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException exception) {
            Toast.makeText(this, "No app can open this link.", Toast.LENGTH_LONG).show();
        }
    }

    private final class HomeBridge {
        @JavascriptInterface
        public void openSite(String url) {
            runOnUiThread(() -> openBrowser(url));
        }

        @JavascriptInterface
        public void copyText(String text) {
            runOnUiThread(() -> {
                ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (clipboard != null) {
                    String safeText = text == null ? "" : text;
                    clipboard.setPrimaryClip(ClipData.newPlainText("Mad Station", safeText));
                    Toast.makeText(MainActivity.this, "Copied to clipboard", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void shareText(String text) {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_SEND);
                intent.setType("text/plain");
                intent.putExtra(Intent.EXTRA_TEXT, text == null ? "" : text);
                try {
                    startActivity(Intent.createChooser(intent, "Share Mad Station backup"));
                } catch (ActivityNotFoundException exception) {
                    Toast.makeText(MainActivity.this, "No app can share this text.", Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    @Override
    public void onBackPressed() {
        if (browserScreen != null && browserScreen.getVisibility() == View.VISIBLE) {
            if (browserWebView != null && browserWebView.canGoBack()) {
                browserWebView.goBack();
            } else {
                showHome();
            }
            return;
        }
        if (homeWebView != null && homeWebView.canGoBack()) {
            homeWebView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (homeWebView != null) {
            homeWebView.removeJavascriptInterface("MadStation");
            homeWebView.destroy();
        }
        if (browserWebView != null) browserWebView.destroy();
        super.onDestroy();
    }
}
