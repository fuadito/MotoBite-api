// src/routes/mpesa.js

// Routes:
//   POST /api/mpesa/stk-push       — trigger M-Pesa prompt
//   POST /api/mpesa/callback       — Safaricom sends result here


import express from 'express';
import axios from 'axios';
import supabase from '../services/supabase.js';

const router = express.Router();

// HELPER — get M-Pesa access token
// Safaricom requires a fresh token for every request
// Token expires after 1 hour

async function getMpesaToken() {
  const key    = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;

  const credentials = Buffer.from(`${key}:${secret}`).toString('base64');

  const { data } = await axios.get(
    'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    { headers: { Authorization: `Basic ${credentials}` } }
  );

  return data.access_token;
}