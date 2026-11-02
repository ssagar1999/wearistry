# Setting up login SMS (MSG91)

Wearistry logs people in with a 6-digit code sent by SMS. The API sends it (`modules/auth/sms.client.js`). In development, `OTP_DEV_CODES=true` shows the code on screen instead. In production, sending a code returns an error until the two MSG91 keys are set.

Sending SMS in India has two parts: **DLT registration** (a TRAI rule for every business that sends SMS) and an **MSG91 account** that does the sending. DLT approval usually takes a few working days, so start it first.

## 1. DLT registration (TRAI)

Register on one telecom operator's DLT portal, such as Jio, Airtel, Vodafone Idea or BSNL. It covers all networks. You need a business document like GST, PAN, or an incorporation or shop certificate. Registration may cost a fee, which depends on the operator.

1. **Register your business as a Principal Entity.** You'll get an **Entity ID** (PE ID).
2. **Register a header (Sender ID).** It's 6 letters, for example `WRSTRY`, and the category is _Transactional_ or _Service Implicit_.
3. **Register a content template** in the _Service Implicit_ (OTP) category. Put `{#var#}` where the code goes, for example:

   ```
   {#var#} is your Wearistry login code. It expires in 5 minutes. Do not share it with anyone.
   ```

   Once it's approved you'll get a **DLT Template ID**.

## 2. MSG91 account

1. Sign up at msg91.com and complete KYC with the same business details.
2. Add your **DLT Entity ID** and your **Sender ID**.
3. In the **OTP** section, create an OTP template.
   - Paste the same wording as the DLT template, with `##OTP##` where DLT has `{#var#}`.
   - Choose your Sender ID and enter the **DLT Template ID**.
   - Save it and copy the MSG91 **template ID** it gives you.
4. Copy your **Auth Key** from the API / Authkey section.
5. Optional but recommended: turn on IP whitelisting for the auth key, so only your server's IP can send SMS.
6. Add SMS credit.

## 3. Add the keys

In `backend/.env` (type the values yourself; never paste them into chats):

```
MSG91_AUTH_KEY=your-auth-key
MSG91_TEMPLATE_ID=your-msg91-otp-template-id
OTP_DEV_CODES=false
```

Never commit `.env`.

## 4. Test it

Send one SMS to your own phone:

```
npm run sms:test -- 98765XXXXX
```

Run that inside `backend/`. If it says `Sent`, restart the API (`npm run dev`) and log in on the site. You should get a real SMS, and the on-screen dev code will be gone.

### If it fails

| MSG91 message                                     | What to check                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `The provided flow ID or template ID is invalid.` | `MSG91_TEMPLATE_ID` is the template ID from MSG91's OTP section, not the DLT Template ID.        |
| `401` / authkey errors                            | `MSG91_AUTH_KEY` is copied in full. If IP whitelisting is on, your current IP is on the list.    |
| Says `Sent` but no SMS arrives                    | The DLT template isn't approved yet, or the MSG91 wording doesn't exactly match the DLT wording. |
| Insufficient balance                              | Add SMS credit in MSG91.                                                                         |

## Hosting

Set the same three variables (`MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `AUTH_SECRET`) in your host's environment settings, such as Vercel's Project → Settings → Environment Variables. If you whitelist IPs in MSG91, note that serverless hosts don't have a fixed IP unless you configure one.
