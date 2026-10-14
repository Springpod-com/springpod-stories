import { Alert, AlertDescription, AlertTitle } from "@springpod/design-system/components/ui/alert";
import { Button } from "@springpod/design-system/components/ui/button";
import { Input } from "@springpod/design-system/components/ui/input";
import { Label } from "@springpod/design-system/components/ui/label";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { devLoginEnabled, signIn } from "@/auth";
import { SiteHeader } from "@/components/site-header";
import { currentStaff } from "@/lib/server/staff";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in | Work Experience Stories admin", robots: { index: false } };

/**
 * Staff sign-in (PRD 11: Springpod staff only, by single sign-on).
 * COPY GAP G11: the wording on this page, including "not on the staff list", is a placeholder.
 */
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentStaff()) redirect("/admin");
  const { error } = await searchParams;
  const google = Boolean(process.env.AUTH_GOOGLE_ID);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader product="Work Experience Stories admin" />
      <main className="mx-auto flex w-full max-w-130 flex-col gap-6 px-4 pt-8">
        <h1 className="ds-h4">Sign in</h1>
        {error && (
          <Alert variant="destructive" data-placeholder>
            <AlertTitle>You can&apos;t sign in with that account</AlertTitle>
            <AlertDescription>Use your Springpod Google account. If you should have access, ask an admin to add you to the staff list.</AlertDescription>
          </Alert>
        )}
        {google && (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/admin" });
            }}
          >
            <Button type="submit" className="w-full">
              Sign in with Google
            </Button>
          </form>
        )}
        {devLoginEnabled() && (
          <form
            className="flex flex-col gap-3"
            action={async (form: FormData) => {
              "use server";
              try {
                await signIn("dev", { email: String(form.get("email") ?? ""), redirectTo: "/admin" });
              } catch (e) {
                // Not on the staff list: back here with the message. Redirects are rethrown.
                if (e instanceof AuthError) redirect("/admin/sign-in?error=AccessDenied");
                throw e;
              }
            }}
          >
            <Alert variant="warning">
              <AlertTitle>Development sign-in</AlertTitle>
              <AlertDescription>For local testing only. Turned off unless ADMIN_DEV_LOGIN=1 and the app runs on localhost.</AlertDescription>
            </Alert>
            <Label htmlFor="dev-email">Staff email</Label>
            <Input id="dev-email" name="email" type="email" autoComplete="email" required />
            <Button type="submit" variant="secondary" className="w-full">
              Sign in for development
            </Button>
          </form>
        )}
        {!google && !devLoginEnabled() && (
          <Alert variant="info">
            <AlertDescription>Sign-in isn&apos;t set up yet. Set AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET (build plan M6).</AlertDescription>
          </Alert>
        )}
      </main>
    </div>
  );
}
