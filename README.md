# Gold Coast Field Connect App

React Native / Expo mobile app for Gold Coast field sales users.

## MVP

- ERPNext username/password login
- Sales App User access check
- Dashboard summary
- My Quotations
- Quotation detail
- Profile/logout

The backend is the ERPNext app:

```text
gold_coast_field_connect
```

Default API base URL:

```text
https://snrgv15backedup.m.frappe.cloud
```

## Development

```bash
npm install
npm run start
```

## Notes

- Do not submit quotations from the app during testing unless WhatsApp automation should trigger.
- Session storage uses Expo SecureStore.

