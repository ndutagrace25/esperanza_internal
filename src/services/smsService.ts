import { env } from "../config/env.js";

const BASE_URL = env.SMS_BASE_URL.replace(/\/$/, "");
const API_KEY = env.SMS_API_KEY;
const SHORTCODE = env.SMS_SHORTCODE;
const PARTNER_ID = env.SMS_PARTNER_ID;

export type SendSingleSmsBody = {
  message: string;
  mobile: string;
  shortcode?: string;
};

export type SingleSmsResponseItem = {
  "respose-code": number;
  "response-description": string;
  mobile: number;
  messageid?: number;
  networkid?: string;
};

export type SingleSmsApiResponse = {
  responses: SingleSmsResponseItem[];
};

export type BulkSmsItem = {
  mobile: string;
  message: string;
  clientsmsid?: number;
};

export type SendBulkSmsBody = {
  smslist: BulkSmsItem[];
};

export type BulkSmsResponseItem = {
  "respose-code": number;
  "response-description": string;
  mobile?: string;
  messageid?: number;
  clientsmsid?: string;
  networkid?: string;
  partnerID?: string;
  shortcode?: string | null;
};

export type BulkSmsApiResponse = {
  responses: BulkSmsResponseItem[];
};

export type GetBalanceApiResponse = {
  balance?: number;
  [key: string]: unknown;
};

function ensureSmsConfig(): void {
  if (!API_KEY || !PARTNER_ID) {
    throw new Error(
      "SMS is not configured: set SMS_API_KEY and SMS_PARTNER_ID in .env"
    );
  }
}

/**
 * Send a single SMS via Advanta/QuickSMS API.
 * POST {SMS_BASE_URL}/api/services/sendsms/
 */
export async function sendSingleSms(
  body: SendSingleSmsBody
): Promise<SingleSmsApiResponse> {
  ensureSmsConfig();

  const url = `${BASE_URL}/api/services/sendsms/`;
  const payload = {
    apikey: API_KEY,
    partnerID: PARTNER_ID,
    message: body.message,
    shortcode: body.shortcode ?? SHORTCODE,
    mobile: body.mobile,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SMS API error (${response.status}): ${text}`);
  }

  const data = (await response.json()) as SingleSmsApiResponse;
  return data;
}

/**
 * Send bulk SMS via Advanta/QuickSMS API.
 * POST {SMS_BASE_URL}/api/services/sendbulk/
 */
export async function sendBulkSms(
  body: SendBulkSmsBody
): Promise<BulkSmsApiResponse> {
  ensureSmsConfig();

  const url = `${BASE_URL}/api/services/sendbulk/`;
  const smslist = body.smslist.map((item, index) => ({
    partnerID: PARTNER_ID,
    apikey: API_KEY,
    pass_type: "plain",
    clientsmsid: item.clientsmsid ?? index + 1,
    mobile: item.mobile,
    message: item.message,
    shortcode: SHORTCODE,
  }));

  const payload = {
    count: smslist.length,
    smslist,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SMS API error (${response.status}): ${text}`);
  }

  const data = (await response.json()) as BulkSmsApiResponse;
  return data;
}

/**
 * Get SMS account balance via Advanta/QuickSMS API.
 * POST {SMS_BASE_URL}/api/services/getbalance
 */
export async function getBalance(): Promise<GetBalanceApiResponse> {
  ensureSmsConfig();

  const url = `${BASE_URL}/api/services/getbalance`;
  const payload = {
    apikey: API_KEY,
    partnerID: PARTNER_ID,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SMS API error (${response.status}): ${text}`);
  }

  const data = (await response.json()) as GetBalanceApiResponse;
  return data;
}
