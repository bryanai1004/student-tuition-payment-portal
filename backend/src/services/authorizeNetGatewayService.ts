type OpaqueDataInput = {
  dataDescriptor: string;
  dataValue: string;
};

type ChargeOpaqueDataInput = {
  amount: number;
  opaqueData: OpaqueDataInput;
  referenceId: string;
  invoiceNumber: string;
  studentId: string;
  termCode: string;
};

export type AuthorizeNetChargeResult = {
  transactionId: string;
  authCode: string | null;
  networkMessage: string;
};

type AuthorizeNetConfig = {
  apiLoginId: string;
  transactionKey: string;
  env: "sandbox" | "production";
};

function readAuthorizeNetConfig():
  | { ok: true; value: AuthorizeNetConfig }
  | { ok: false; message: string } {
  const apiLoginId = (process.env.AUTHORIZE_API_LOGIN_ID ?? "").trim();
  const transactionKey = (process.env.AUTHORIZE_TRANSACTION_KEY ?? "").trim();
  const envRaw = (process.env.AUTHORIZE_ENV ?? "sandbox").trim().toLowerCase();
  const env: "sandbox" | "production" =
    envRaw === "production" ? "production" : "sandbox";
  if (!apiLoginId || !transactionKey) {
    return {
      ok: false,
      message:
        "Authorize.net credentials are not configured on the server.",
    };
  }
  return {
    ok: true,
    value: {
      apiLoginId,
      transactionKey,
      env,
    },
  };
}

function gatewayUrl(env: "sandbox" | "production"): string {
  return env === "production"
    ? "https://api2.authorize.net/xml/v1/request.api"
    : "https://apitest.authorize.net/xml/v1/request.api";
}

function toTwoDecimals(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function extractAuthorizeError(body: unknown): string {
  if (body == null || typeof body !== "object") {
    return "Payment provider returned an invalid response.";
  }
  const root = body as Record<string, unknown>;
  const ctr = root.createTransactionResponse;
  if (ctr == null || typeof ctr !== "object") {
    return "Payment provider returned an invalid response.";
  }
  const response = ctr as Record<string, unknown>;
  const tx = response.transactionResponse;
  if (tx != null && typeof tx === "object") {
    const txObj = tx as Record<string, unknown>;
    const errorsRaw = txObj.errors;
    if (errorsRaw != null && typeof errorsRaw === "object") {
      const errorNode = (errorsRaw as Record<string, unknown>).error;
      if (Array.isArray(errorNode) && errorNode.length > 0) {
        const first = errorNode[0];
        if (first != null && typeof first === "object") {
          const text = String((first as Record<string, unknown>).errorText ?? "").trim();
          if (text) return text;
        }
      } else if (errorNode != null && typeof errorNode === "object") {
        const text = String((errorNode as Record<string, unknown>).errorText ?? "").trim();
        if (text) return text;
      }
    }
    const msgRaw = txObj.messages;
    if (Array.isArray(msgRaw) && msgRaw.length > 0) {
      const first = msgRaw[0];
      if (first != null && typeof first === "object") {
        const text = String((first as Record<string, unknown>).description ?? "").trim();
        if (text) return text;
      }
    }
  }
  const msgRoot = response.messages;
  if (msgRoot != null && typeof msgRoot === "object") {
    const m = (msgRoot as Record<string, unknown>).message;
    if (Array.isArray(m) && m.length > 0) {
      const first = m[0];
      if (first != null && typeof first === "object") {
        const text = String((first as Record<string, unknown>).text ?? "").trim();
        if (text) return text;
      }
    } else if (m != null && typeof m === "object") {
      const text = String((m as Record<string, unknown>).text ?? "").trim();
      if (text) return text;
    }
  }
  return "Authorize.net could not process this payment.";
}

export async function chargeAuthorizeOpaqueData(
  input: ChargeOpaqueDataInput,
): Promise<AuthorizeNetChargeResult> {
  const config = readAuthorizeNetConfig();
  if (!config.ok) {
    throw new Error(config.message);
  }
  const payload = {
    createTransactionRequest: {
      merchantAuthentication: {
        name: config.value.apiLoginId,
        transactionKey: config.value.transactionKey,
      },
      refId: input.referenceId,
      transactionRequest: {
        transactionType: "authCaptureTransaction",
        amount: toTwoDecimals(input.amount),
        payment: {
          opaqueData: {
            dataDescriptor: input.opaqueData.dataDescriptor.trim(),
            dataValue: input.opaqueData.dataValue.trim(),
          },
        },
        order: {
          invoiceNumber: input.invoiceNumber,
          description: `myAMU tuition payment ${input.termCode}`.slice(0, 255),
        },
        customer: {
          id: input.studentId.trim(),
        },
      },
    },
  };
  const response = await fetch(gatewayUrl(config.value.env), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  let body: unknown = null;
  try {
    body = (await response.json()) as unknown;
  } catch {
    throw new Error("Payment provider returned a non-JSON response.");
  }
  if (!response.ok) {
    throw new Error(extractAuthorizeError(body));
  }
  if (body == null || typeof body !== "object") {
    throw new Error("Payment provider returned an invalid response.");
  }

  const root = body as Record<string, unknown>;
  const ctr = root.createTransactionResponse;
  if (ctr == null || typeof ctr !== "object") {
    throw new Error("Payment provider returned an invalid response.");
  }
  const responseBody = ctr as Record<string, unknown>;
  const tx = responseBody.transactionResponse;
  if (tx == null || typeof tx !== "object") {
    throw new Error(extractAuthorizeError(body));
  }

  const txObj = tx as Record<string, unknown>;
  const txId = String(txObj.transId ?? "").trim();
  const responseCode = String(txObj.responseCode ?? "").trim();
  if (!txId || responseCode !== "1") {
    throw new Error(extractAuthorizeError(body));
  }

  const authCode = String(txObj.authCode ?? "").trim() || null;
  let networkMessage = "Approved";
  const messages = txObj.messages;
  if (Array.isArray(messages) && messages.length > 0) {
    const first = messages[0];
    if (first != null && typeof first === "object") {
      const description = String((first as Record<string, unknown>).description ?? "").trim();
      if (description) networkMessage = description;
    }
  }

  return {
    transactionId: txId,
    authCode,
    networkMessage,
  };
}
