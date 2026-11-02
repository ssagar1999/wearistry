# Setting up Google sign-in

This guide creates a Google OAuth client so people can tap **Continue with Google**. It takes about 10 minutes in the Google Cloud Console. You need a Google account. These steps can't be done for you, because they happen in your Google account.

Until this is set up, Google sign-in is simply off: the API answers 503, and the web app hides the button.

## 1. Create a project

1. Open **console.cloud.google.com** and sign in.
2. In the top bar, open the project picker, then **New project**. Name it, for example, `Wearistry`, and create it. Make sure it's selected afterwards.

## 2. Configure the consent screen

This is what users see when Google asks "Allow Wearistry to…".

1. Go to **APIs & Services → OAuth consent screen** (newer consoles call it **Google Auth Platform → Branding**).
2. Fill in:
   - **App name:** Wearistry.
   - **User support email:** your email.
   - **Audience / user type:** **External**.
   - **Developer contact email:** your email.
3. **Scopes:** only the basic ones are needed: `openid`, `email` and `profile`. These don't require Google verification.
4. **Test users:** while the app is in **Testing** status, only the Google accounts you list here can sign in. Add your own. When you're ready for everyone, choose **Publish app**.

## 3. Create the OAuth client

1. Go to **APIs & Services → Credentials** (or **Google Auth Platform → Clients**), then **Create credentials → OAuth client ID**.
2. **Application type:** **Web application**. **Name:** `Wearistry web`.
3. **Authorised JavaScript origins:**
   - `http://localhost:3000`
   - later, your live site, for example `https://wearistry.in`
4. **Authorised redirect URIs.** This must match exactly, including the path:
   - `http://localhost:3000/api/v1/auth/google/callback`
   - later, `https://wearistry.in/api/v1/auth/google/callback`
5. Click **Create**, then copy the **Client ID** and **Client secret**.

The redirect URI uses the **web app's** address (port 3000), not the API's (port 4000). Google sends the browser back to the web app, which forwards the request to the API. That's what keeps the login cookie on your own domain.

## 4. Add the keys

In `backend/.env` (type them yourself; never paste secrets into chats or tickets):

```
GOOGLE_CLIENT_ID=1234567890-abc...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
APP_URL=http://localhost:3000
```

In `frontend/.env`, show the button:

```
NEXT_PUBLIC_GOOGLE_LOGIN=true
```

Restart both apps (`npm run dev` in `backend/` and `frontend/`).

## 5. Try it

Open http://localhost:3000/login and tap **Continue with Google**. Pick a test-user account and approve. You'll land back on Wearistry, logged in. New accounts are asked for a name and city first.

## If it fails

| What you see                                        | What to check                                                                                                                                   |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Google says **redirect_uri_mismatch**               | The redirect URI in step 3 must be exactly `APP_URL` + `/api/v1/auth/google/callback`, with no trailing slash, and `http` vs `https` must match |
| Google says **access blocked / app not verified**   | While in Testing, add your account under **Test users**, or publish the app                                                                     |
| Back on Wearistry with "Google sign-in didn't work" | Check the API logs for `Google sign-in failed`. Common causes: a wrong client secret, or cookies blocked in the browser                         |
| "Google sign-in isn't available right now"          | `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` aren't both set in `backend/.env`, or the API wasn't restarted                                    |
| No Google button                                    | `NEXT_PUBLIC_GOOGLE_LOGIN=true` isn't set in `frontend/.env`. Restart the web app after changing it                                             |

## Going live

1. **Add the production origin and redirect URI** to the same OAuth client (step 3).
2. **Set production values** on your server: `APP_URL=https://<your-domain>` plus the two Google keys.
3. **Publish the consent screen** so anyone with a Google account can sign in.
