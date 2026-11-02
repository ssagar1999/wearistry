# Setting up photo storage (Amazon S3 + CloudFront)

Uploaded photos are saved in 3 sizes (480, 960 and 1600 px wide, WebP). Without S3 settings, dev mode keeps them in `.data/uploads` on your computer. A live site needs S3, and the server refuses uploads in production without it.

Use the **Mumbai region (`ap-south-1`)** so photos are stored close to your users. Put **CloudFront** in front of the bucket, which serves photos from edge locations in Indian cities and makes them load faster.

## 1. Create the bucket

1. In the AWS Console, open **S3 → Create bucket**.
2. Use a name like `wearistry-photos` (bucket names are global, so add something unique if it's taken) and choose the region **Asia Pacific (Mumbai) ap-south-1**.
3. Keep **Block all public access ON**. CloudFront reads the files, so the bucket itself stays private.
4. Create it.

## 2. Create a CloudFront distribution

1. Open **CloudFront → Create distribution**.
2. **Origin:** choose your S3 bucket.
3. **Origin access:** choose **Origin access control (OAC)** and create a new OAC. CloudFront then shows a bucket policy; copy it into **S3 → your bucket → Permissions → Bucket policy**. This lets CloudFront, and nobody else, read the files.
4. **Viewer protocol policy:** Redirect HTTP to HTTPS.
5. **Cache policy:** `CachingOptimized`. Each photo has a unique name and is never changed, so it can be cached forever. The app also sends `Cache-Control: immutable`.
6. Create the distribution and copy its domain, such as `d1234abcd.cloudfront.net`.

You can also add your own domain later, such as `photos.wearistry.in`.

## 3. Create an IAM user for the app

The app only needs to **upload** photos, so give it nothing more:

1. Go to **IAM → Users → Create user**, for example `wearistry-app`, with no console access.
2. Choose **Attach policies directly → Create policy → JSON** and paste this, replacing the bucket name:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": "s3:PutObject",
         "Resource": "arn:aws:s3:::wearistry-photos/photos/*"
       }
     ]
   }
   ```

3. Attach the policy to the user. Then open the user → **Security credentials → Create access key → "Application running outside AWS"**.
4. Copy the **Access key ID** and **Secret access key**. The secret is shown only once.

## 4. Add the settings

In `.env.local` (and later in your host's environment settings):

```
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET=wearistry-photos
S3_PUBLIC_URL=https://d1234abcd.cloudfront.net
```

`S3_PUBLIC_URL` has no trailing slash. Restart `npm run dev`, upload a photo on **Sell**, and check that the photo shows up and that its address starts with your CloudFront domain.

Never commit these keys, and never put them in code. If a key leaks, delete it in IAM and create a new one.

## If it fails

| Problem | What to check |
| --- | --- |
| Upload says "Couldn't save that photo" and the server log shows `AccessDenied` | The IAM policy's bucket name and the `photos/*` path match `S3_BUCKET`. |
| `InvalidAccessKeyId` / `SignatureDoesNotMatch` | The keys were copied completely, with no extra spaces. |
| Upload works but the photo is broken (403) | The CloudFront OAC bucket policy is saved on the bucket. |
| Photo is broken (404) right after creating CloudFront | Wait 5–10 minutes for the distribution to finish deploying. |
