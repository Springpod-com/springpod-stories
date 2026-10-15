import Script from "next/script";

/**
 * Loads GA4 for the public flow when `NEXT_PUBLIC_GA4_ID` is set (PRD 16). Analytics storage
 * starts denied, so no cookies are set until a consent decision is made (build plan Q31).
 */
export function Analytics() {
  const id = process.env.NEXT_PUBLIC_GA4_ID;
  if (!id) return null;
  return (
    <>
      <Script id="ga4-consent" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
gtag('js',new Date());gtag('config',${JSON.stringify(id)});`}
      </Script>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`} strategy="afterInteractive" />
    </>
  );
}
