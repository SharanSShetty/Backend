import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import { Resend } from 'resend'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 4000

// When behind a proxy/load balancer (like Render, Vercel, Nginx, etc.),
// Express must trust the proxy to correctly read X-Forwarded-* headers.
// This MUST be set BEFORE using middlewares like express-rate-limit.
// Setting to 1 trusts the first proxy hop which is typical for Render.
app.set('trust proxy', 1)

// Parse JSON
app.use(express.json())

// Security headers
app.use(helmet())

// CORS configuration
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser tools or same-origin
    if (!origin) return callback(null, true)
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true)
    }
    return callback(new Error('Not allowed by CORS'))
  },
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}))

// Basic rate limit
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute per IP
})
app.use('/api/', limiter)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() })
})

// Email provider (Resend over HTTPS)
const RESEND_API_KEY = process.env.RESEND_API_KEY
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null

app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body || {}

    if (!name || !email || !message) {
      return res.status(400).json({ ok: false, error: 'Missing required fields' })
    }

    // Very basic validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ ok: false, error: 'Invalid email' })
    }

    const toEmail = process.env.TO_EMAIL || 'you@example.com'
    const fromName = process.env.FROM_NAME || 'Portfolio Contact Form'

    const subject = `New Contact Message from ${name}`
    const text = `You have a new message from your portfolio contact form.\n\nName: ${name}\nEmail: ${email}\n\nMessage:\n${message}`
    const html = renderContactEmail({ name, email, message })

    if (!resend) {
      throw new Error('Resend is not configured. Set RESEND_API_KEY in your environment')
    }

    const defaultResendFrom = 'onboarding@resend.dev'
    const fromHeader = `${fromName} <${process.env.RESEND_FROM || defaultResendFrom}>`
    const result = await resend.emails.send({
      from: fromHeader,
      to: [toEmail],
      subject,
      html,
      text,
      reply_to: email,
    })
    if (result.error) {
      throw new Error(`Resend error: ${result.error.message || 'unknown error'}`)
    }

    return res.json({ ok: true })
  } catch (err) {
    console.error('Contact send error:', err)
    return res.status(500).json({ ok: false, error: 'Failed to send message' })
  }
})

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function renderContactEmail({ name = '', email = '', message = '' } = {}) {
  const safeName = escapeHtml(name)
  const safeEmail = escapeHtml(email)
  const safeMessage = escapeHtml(message)

  // Simple, broadly compatible HTML email template with inline styles
  return `
  <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="x-ua-compatible" content="ie=edge" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>New Contact Message</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="background-color:#f4f5f7;">
    <tr>
      <td>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="600" style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e6e8eb;box-shadow:0 4px 12px rgba(0,0,0,0.06);">
          
          <!-- Header -->
          <tr>
            <td style="padding:24px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#ffffff;text-align:center;">
              <h1 style="margin:0;font-size:22px;line-height:28px;font-weight:600;">New Contact Form Message</h1>
              <p style="margin:8px 0 0 0;font-size:14px;opacity:.9;">Someone reached out via your portfolio</p>
            </td>
          </tr>

          <!-- Sender Details -->
          <tr>
            <td style="padding:24px;">
              <h2 style="margin:0 0 16px 0;font-size:18px;color:#111827;border-bottom:2px solid #f3f4f6;padding-bottom:6px;">📌 Sender Details</h2>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;border-spacing:0 12px;">
                <tr>
                  <td style="width:140px;color:#6b7280;font-size:14px;">👤 Name</td>
                  <td style="color:#111827;font-size:14px;font-weight:600;">${safeName}</td>
                </tr>
                <tr>
                  <td style="width:140px;color:#6b7280;font-size:14px;">✉️ Email</td>
                  <td style="color:#111827;font-size:14px;font-weight:600;">
                    <a href="mailto:${safeEmail}" style="color:#2563eb;text-decoration:none;">${safeEmail}</a>
                  </td>
                </tr>
              </table>

              <!-- Message -->
              <h2 style="margin:28px 0 12px 0;font-size:18px;color:#111827;border-bottom:2px solid #f3f4f6;padding-bottom:6px;">💬 Message</h2>
              <div style="padding:18px;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa;color:#111827;white-space:pre-wrap;font-size:14px;line-height:1.6;">${safeMessage}</div>

              <!-- Call to Action -->
              <div style="margin-top:24px;text-align:center;">
                <a href="mailto:${safeEmail}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,0.1);">Reply Now</a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;background:#f9fafb;color:#6b7280;font-size:12px;border-top:1px solid #e6e8eb;text-align:center;">
              <p style="margin:0;">This email was generated by your <strong>Portfolio Contact Form</strong>.</p>
            </td>
          </tr>
        </table>
        <p style="text-align:center;color:#9ca3af;font-size:12px;margin:12px 0 32px 0;">&copy; ${new Date().getFullYear()} Portfolio. All rights reserved.</p>
      </td>
    </tr>
  </table>
</body>
</html>
`
}

app.listen(PORT, () => {
  console.log(`Mailer backend listening on http://localhost:${PORT}`)
})
