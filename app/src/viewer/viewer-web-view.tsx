import { useImperativeHandle, useRef, type Ref } from 'react';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { logger } from '../logger';
import { viewerHtml } from './generated/viewer-html';

export interface ViewerWebViewHandle {
  /** Sends a JSON string to the page. */
  postMessage: (json: string) => void;
}

interface ViewerWebViewProps {
  ref?: Ref<ViewerWebViewHandle>;
  backgroundColor: string;
  /** A raw message string from the page. */
  onMessage: (raw: string) => void;
  /** The web view's renderer process died (usually out of memory). */
  onProcessGone: () => void;
}

/** The only addresses the first load can have: the page is given as HTML, so it has no address of its own. */
function isInitialLoad(url: string): boolean {
  return url === 'about:blank' || url === '' || url.startsWith('data:text/html');
}

/** The web view that runs the viewer page, locked down: no storage, files, network pages, windows or navigation. */
export function ViewerWebView({ ref, backgroundColor, onMessage, onProcessGone }: ViewerWebViewProps) {
  const webView = useRef<WebView<object>>(null);
  const initialLoadDone = useRef(false);

  useImperativeHandle(ref, () => ({
    postMessage: (json: string) => webView.current?.postMessage(json),
  }));

  return (
    <WebView
      ref={webView}
      source={{ html: viewerHtml }}
      style={{ flex: 1, backgroundColor }}
      containerStyle={{ backgroundColor }}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled={false}
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      geolocationEnabled={false}
      cacheEnabled={false}
      mixedContentMode="never"
      setSupportMultipleWindows={false}
      setBuiltInZoomControls
      setDisplayZoomControls={false}
      // The page sizes its own text: the system font scale would distort Raw pages and add to Rendered's sizes.
      textZoom={100}
      onShouldStartLoadWithRequest={(request) => {
        logger.debug('web view load request', request.url);
        if (!initialLoadDone.current && isInitialLoad(request.url)) {
          initialLoadDone.current = true;
          return true;
        }
        return false;
      }}
      onMessage={(event: WebViewMessageEvent) => onMessage(event.nativeEvent.data)}
      onRenderProcessGone={() => onProcessGone()}
    />
  );
}
