import https from "node:https";
import { URL } from "node:url";

export type ApplePayMerchantValidationInput = {
  validationUrl: string;
  merchantIdentifier: string;
  displayName: string;
  domainName: string;
  merchantCertPem: string;
  merchantKeyPem: string;
};

function postJsonWithClientCert(
  targetUrl: string,
  body: unknown,
  cert: string,
  key: string,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        cert,
        key,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode == null || res.statusCode < 200 || res.statusCode >= 300) {
            reject(
              new Error(
                `Apple Pay merchant validation failed (${res.statusCode ?? "?"}): ${text.slice(0, 200)}`,
              ),
            );
            return;
          }
          try {
            resolve(JSON.parse(text) as unknown);
          } catch {
            reject(new Error("Apple Pay merchant validation returned invalid JSON."));
          }
        });
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

export function readApplePayServerConfig():
  | {
      ok: true;
      merchantIdentifier: string;
      displayName: string;
      domainName: string;
      merchantCertPem: string;
      merchantKeyPem: string;
    }
  | { ok: false; message: string } {
  const merchantIdentifier = (process.env.APPLE_PAY_MERCHANT_ID ?? "").trim();
  const displayName = (process.env.APPLE_PAY_DISPLAY_NAME ?? "Alhambra Medical University").trim();
  const domainName = (process.env.APPLE_PAY_DOMAIN ?? "myamu.wanpanel.ai").trim();
  const merchantCertPem = (process.env.APPLE_PAY_MERCHANT_CERT ?? "").trim().replace(/\\n/g, "\n");
  const merchantKeyPem = (process.env.APPLE_PAY_MERCHANT_KEY ?? "").trim().replace(/\\n/g, "\n");

  if (!merchantIdentifier) {
    return { ok: false, message: "Apple Pay merchant ID is not configured." };
  }
  if (!merchantCertPem || !merchantKeyPem) {
    return {
      ok: false,
      message: "Apple Pay merchant certificate/key are not configured on the server.",
    };
  }
  return {
    ok: true,
    merchantIdentifier,
    displayName,
    domainName,
    merchantCertPem,
    merchantKeyPem,
  };
}

export async function validateApplePayMerchantSession(
  validationUrl: string,
): Promise<unknown> {
  const config = readApplePayServerConfig();
  if (!config.ok) {
    throw new Error(config.message);
  }
  const trimmedUrl = validationUrl.trim();
  if (trimmedUrl === "" || !/^https:\/\//i.test(trimmedUrl)) {
    throw new Error("validationUrl must be a valid HTTPS URL from Apple Pay.");
  }

  return postJsonWithClientCert(
    trimmedUrl,
    {
      merchantIdentifier: config.merchantIdentifier,
      displayName: config.displayName,
      domainName: config.domainName,
    },
    config.merchantCertPem,
    config.merchantKeyPem,
  );
}
