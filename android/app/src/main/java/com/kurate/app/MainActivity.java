package com.kurate.app;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Bridge;
import android.webkit.WebView;
import android.webkit.WebResourceRequest;
import android.webkit.WebViewClient;
import android.os.Build;
import android.net.Uri;

public class MainActivity extends BridgeActivity {
    @Override
    public void onResume() {
        super.onResume();
        Bridge bridge = getBridge();
        if (bridge != null) {
            WebView webView = (WebView) bridge.getWebView();
            if (webView != null) {
                webView.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView view, String url) {
                        if (url != null && url.startsWith("kurate://exit")) {
                            finish();
                            moveTaskToBack(true);
                            return true;
                        }
                        return false;
                    }
                });
            }
        }
    }
}
