import GlobalProvider from "containers"; // Context provider
import Router from "next/router"; // Next Router
import Script from "next/script"; // Next Script
import "node_modules/nprogress/nprogress.css"; // NProgress styles
import nProgress from "nprogress"; // nProgress loading bar
import "styles/global.scss"; // Global styles

// Router load animations
Router.events.on("routeChangeStart", () => nProgress.start());
Router.events.on("routeChangeComplete", () => nProgress.done());
Router.events.on("routeChangeErorr", () => nProgress.done());

// Application
export default function CompVote({ Component, pageProps }) {
  return (
    // Wrap page in context provider
    <>
      <Script
        strategy="lazyOnload"
        src="https://www.googletagmanager.com/gtag/js?id=G-RBM6MN2RT3"
      />

      <Script strategy="lazyOnload">
        {`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'G-RBM6MN2RT3', {
        page_path: window.location.pathname,
        });
    `}
      </Script>
      <GlobalProvider>
        <Component {...pageProps} />
      </GlobalProvider>
    </>
  );
}
