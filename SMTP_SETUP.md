# SMTP Configuration Guide

## Gmail Setup

1. **Enable 2-Step Verification** (if not already enabled)

   - Go to: https://myaccount.google.com/security
   - Enable 2-Step Verification

2. **Generate App Password**

   - Go to: https://myaccount.google.com/apppasswords
   - Select "Mail" and "Other (Custom name)"
   - Enter "Esperanza Internal" as the name
   - Click "Generate"
   - Copy the 16-character password (no spaces)

3. **Use these settings in your `.env` file:**
   ```
   SMTP_HOST="smtp.gmail.com"
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER="your-email@gmail.com"
   SMTP_PASS="your-16-character-app-password"
   SMTP_FROM="your-email@gmail.com"
   ```

## Outlook/Hotmail Setup

1. **Enable App Password**

   - Go to: https://account.microsoft.com/security
   - Enable 2-Step Verification
   - Go to "App passwords" and create a new one

2. **Use these settings:**
   ```
   SMTP_HOST="smtp-mail.outlook.com"
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER="your-email@outlook.com"
   SMTP_PASS="your-app-password"
   SMTP_FROM="your-email@outlook.com"
   ```

## Yahoo Mail Setup

1. **Generate App Password**

   - Go to: https://login.yahoo.com/account/security
   - Enable 2-Step Verification
   - Generate an app password

2. **Use these settings:**
   ```
   SMTP_HOST="smtp.mail.yahoo.com"
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER="your-email@yahoo.com"
   SMTP_PASS="your-app-password"
   SMTP_FROM="your-email@yahoo.com"
   ```

## Other Email Providers

### ProtonMail

```
SMTP_HOST="127.0.0.1"
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER="your-email@protonmail.com"
SMTP_PASS="your-password"
SMTP_FROM="your-email@protonmail.com"
```

### Zoho Mail

```
SMTP_HOST="smtp.zoho.com"
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER="your-email@zoho.com"
SMTP_PASS="your-password"
SMTP_FROM="your-email@zoho.com"
```

## Testing Your Configuration

After setting up, test the email functionality by making a request to:

```
POST /api/auth/request-password-reset
{
  "email": "test@example.com"
}
```

## Security Notes

- Never commit your `.env` file to version control
- Use App Passwords instead of your main account password
- For production, consider using a dedicated email service like SendGrid, Mailgun, or AWS SES
