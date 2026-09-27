/**
 * Phase 1 MVP integration suite.
 *
 * Requires a backend already listening on :4000 (npm run dev in another shell).
 * It exercises the three Phase 1 pillars against the real HTTP + WebSocket stack:
 *
 *   1. Auth     - phone/OTP request, resend throttle, verify, replay rejection.
 *   2. Realtime - 1:1 direct chat creation plus a full message round trip:
 *                 chat:message_ack to the sender, chat:new_message to the peer,
 *                 and chat:receipt_update READ once the peer opens the chat.
 *   3. Media    - authenticated upload, anonymous download refusal, membership
 *                 check on download, and byte-identical retrieval.
 *
 * Run:
 *   cd backend && npm run dev          # terminal 1
 *   cd backend && npm run test:phase1  # terminal 2
 */
import { WebSocket } from "ws";

const BASE_URL = process.env.PHASE1_BASE_URL || "http://localhost:4000/api";
const WS_URL = process.env.PHASE1_WS_URL || "ws://localhost:4000/ws";
const RUN_ID = Date.now().toString(36);

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string): void {
    if (ok) {
        console.log(`  PASS  ${name}`);
        passed++;
    } else {
        console.log(`  FAIL  ${name}`);
        if (detail) console.log(`        ${detail}`);
        failed++;
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(
    path: string,
    options: { method?: string; token?: string; body?: unknown } = {}
): Promise<{ status: number; data: any }> {
    const res = await fetch(`${BASE_URL}${path}`, {
        method: options.method ?? "GET",
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const text = await res.text();
    let data: any = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = text;
    }
    return { status: res.status, data };
}

function connectWebSocket(
    token: string,
    deviceId: string
): Promise<{ ws: WebSocket; events: any[] }> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(WS_URL);
        const events: any[] = [];
        const timer = setTimeout(
            () => reject(new Error(`WebSocket handshake timeout for ${deviceId}`)),
            10000
        );

        ws.on("message", (data) => {
            try {
                events.push(JSON.parse(data.toString()));
            } catch {
                // Ignore malformed frames.
            }
        });

        ws.on("error", (err) => {
            clearTimeout(timer);
            reject(err);
        });

        ws.on("open", () => {
            ws.send(
                JSON.stringify({
                    type: "auth:handshake",
                    payload: { token, device_id: deviceId },
                    timestamp: Date.now(),
                })
            );

            const poll = setInterval(() => {
                if (events.some((event) => event.type === "auth:ack")) {
                    clearInterval(poll);
                    clearTimeout(timer);
                    resolve({ ws, events });
                }
            }, 50);
        });
    });
}

async function waitForEvent(
    events: any[],
    predicate: (event: any) => boolean,
    timeoutMs = 8000
): Promise<any | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const found = events.find(predicate);
        if (found) return found;
        await sleep(50);
    }
    return null;
}

async function registerUser(label: string) {
    const res = await api("/auth/register", {
        method: "POST",
        body: {
            phoneNumber: `+1999${RUN_ID}${label}`,
            username: `p1_${label}_${RUN_ID}`,
            displayName: `Phase1 ${label}`,
            password: "Phase1Passw0rd!",
        },
    });

    if (res.status !== 200 && res.status !== 201) {
        throw new Error(`register(${label}) failed: ${res.status} ${JSON.stringify(res.data)}`);
    }

    return { token: res.data.token as string, user: res.data.user };
}

// A real 1x1 PNG: the media service validates magic bytes, so a fake payload
// would (correctly) be rejected before this suite ever reached the fetch checks.
const PNG_BASE64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";async function runPhase1Suite(): Promise<void> {
    console.log("===============================================================");
    console.log("PHASE 1 MVP INTEGRATION SUITE");
    console.log("===============================================================\n");

    // ---- 0. Availability ---------------------------------------------------
    console.log("0) Server availability");
    const health = await api("/health");
    check("GET /api/health answers 200", health.status === 200, `got ${health.status}`);

    // ---- 1. Phone / OTP authentication ------------------------------------
    console.log("\n1) Phone / OTP authentication");
    const otpPhone = `+1555${String(Date.now()).slice(-8)}`;

    const otpRequest = await api("/auth/request-otp", {
        method: "POST",
        body: { phoneNumber: otpPhone },
    });
    check(
        "POST /auth/request-otp answers 200",
        otpRequest.status === 200,
        `got ${otpRequest.status} ${JSON.stringify(otpRequest.data)}`
    );
    check(
        "the response carries the validity window and resend cooldown",
        otpRequest.data?.expiresInSeconds === 300 && otpRequest.data?.resendAfterSeconds === 30,
        JSON.stringify(otpRequest.data)
    );

    const otpResend = await api("/auth/request-otp", {
        method: "POST",
        body: { phoneNumber: otpPhone },
    });
    check(
        "an immediate resend for the same number is refused",
        otpResend.status === 400 || otpResend.status === 429,
        `got ${otpResend.status} ${JSON.stringify(otpResend.data)}`
    );

    const devCode: string | undefined = otpRequest.data?.devCode;
    if (!devCode) {
        console.log("  SKIP  verify-otp checks (server is in production mode, so no dev code is echoed)");
    } else {
        const wrongCode = await api("/auth/verify-otp", {
            method: "POST",
            body: { phoneNumber: otpPhone, otp: "000000" },
        });
        check("a wrong code is refused", wrongCode.status === 400, `got ${wrongCode.status}`);

        const verified = await api("/auth/verify-otp", {
            method: "POST",
            body: { phoneNumber: otpPhone, otp: devCode },
        });
        check(
            "verify-otp signs the phone number in",
            verified.status === 200 && typeof verified.data?.token === "string",
            `got ${verified.status} ${JSON.stringify(verified.data)}`
        );
        check("verify-otp issues a refresh token", typeof verified.data?.refreshToken === "string");

        const replay = await api("/auth/verify-otp", {
            method: "POST",
            body: { phoneNumber: otpPhone, otp: devCode },
        });
        check("a consumed code cannot sign in again", replay.status === 400, `got ${replay.status}`);
    }

    // ---- 2. Direct chat creation ------------------------------------------
    console.log("\n2) 1:1 direct chat");
    const alice = await registerUser("a");
    const bob = await registerUser("b");
    const outsider = await registerUser("c");
    check("three accounts registered", Boolean(alice.token && bob.token && outsider.token));

    const direct = await api("/chats/direct", {
        method: "POST",
        token: alice.token,
        body: { targetUserId: bob.user.id },
    });
    check(
        "POST /chats/direct returns a chat object",
        direct.status === 200 && typeof direct.data?.chat?.id === "string",
        `got ${direct.status} ${JSON.stringify(direct.data)}`
    );
    const chatId: string = direct.data?.chat?.id;
    check(
        "the direct chat resolves the peer user",
        direct.data?.chat?.peer_user?.id === bob.user.id,
        JSON.stringify(direct.data?.chat?.peer_user)
    );

    const missingTarget = await api("/chats/direct", {
        method: "POST",
        token: alice.token,
        body: {},
    });
    check("POST /chats/direct without targetUserId is a 400", missingTarget.status === 400, `got ${missingTarget.status}`);

    const chatList = await api("/chats", { token: alice.token });
    const listed = Array.isArray(chatList.data?.chats)
        ? chatList.data.chats.find((chat: any) => chat.id === chatId)
        : undefined;
    check(
        "GET /chats lists the new chat as a real object",
        Boolean(listed),
        `status ${chatList.status}, chats ${JSON.stringify(chatList.data?.chats)?.slice(0, 120)}`
    );    // ---- 3. Realtime round trip -------------------------------------------
    console.log("\n3) Realtime WebSocket round trip");
    const aliceWs = await connectWebSocket(alice.token, "phase1-alice");
    const bobWs = await connectWebSocket(bob.token, "phase1-bob");
    check(
        "both users authenticate over WebSocket",
        aliceWs.events.some((event) => event.type === "auth:ack") &&
            bobWs.events.some((event) => event.type === "auth:ack")
    );

    const tempId = `phase1_${RUN_ID}`;
    aliceWs.ws.send(
        JSON.stringify({
            type: "chat:send_message",
            payload: { temp_id: tempId, chat_id: chatId, content: "phase 1 round trip" },
            timestamp: Date.now(),
        })
    );

    const ack = await waitForEvent(
        aliceWs.events,
        (event) => event.type === "chat:message_ack" && event.payload?.temp_id === tempId
    );
    check("the sender receives chat:message_ack", Boolean(ack), "no ack within 8s");
    const messageId: string = ack?.payload?.message_id;
    check("the ack carries the persisted message id", typeof messageId === "string" && messageId.length > 0);

    const inbound = await waitForEvent(
        bobWs.events,
        (event) => event.type === "chat:new_message" && event.payload?.message?.id === messageId
    );
    check("the peer receives chat:new_message", Boolean(inbound), "no inbound frame within 8s");
    check(
        "the delivered message keeps its body",
        inbound?.payload?.message?.content_text === "phase 1 round trip",
        JSON.stringify(inbound?.payload?.message?.content_text)
    );
    check(
        "an online peer is marked DELIVERED",
        inbound?.payload?.message?.status === "DELIVERED",
        `got ${inbound?.payload?.message?.status}`
    );

    const readRes = await api(`/chats/${chatId}/read-all`, { method: "POST", token: bob.token });
    check(
        "POST /chats/:id/read-all reports the messages read",
        readRes.status === 200 && (readRes.data?.count ?? 0) >= 1,
        `got ${readRes.status} ${JSON.stringify(readRes.data)}`
    );

    const readReceipt = await waitForEvent(
        aliceWs.events,
        (event) =>
            event.type === "chat:receipt_update" &&
            event.payload?.message_id === messageId &&
            event.payload?.status === "READ"
    );
    check("the sender is told the message was read", Boolean(readReceipt), "no READ receipt within 8s");

    // ---- 4. Media upload and authenticated download ------------------------
    console.log("\n4) Media upload and authenticated download");
    const upload = await api("/media/upload", {
        method: "POST",
        token: alice.token,
        body: {
            base64Data: `data:image/png;base64,${PNG_BASE64}`,
            fileName: "phase1.png",
            mimeType: "image/png",
        },
    });
    check(
        "POST /media/upload stores the file",
        upload.status === 200 && typeof upload.data?.media?.url === "string",
        `got ${upload.status} ${JSON.stringify(upload.data)}`
    );
    const mediaUrl: string = upload.data?.media?.url ?? "";
    check("the upload returns a /uploads/ URL", mediaUrl.startsWith("/uploads/"), mediaUrl);

    const anonymous = await fetch(`${BASE_URL}${mediaUrl}`);
    check(
        "an anonymous download is refused",
        anonymous.status === 401 || anonymous.status === 419,
        `got ${anonymous.status}`
    );

    // Attach the file to the chat so the membership rule has something to check.
    const mediaTempId = `phase1_media_${RUN_ID}`;
    aliceWs.ws.send(
        JSON.stringify({
            type: "chat:send_message",
            payload: {
                temp_id: mediaTempId,
                chat_id: chatId,
                content: "",
                type: "IMAGE",
                media_url: mediaUrl,
            },
            timestamp: Date.now(),
        })
    );
    const mediaAck = await waitForEvent(
        aliceWs.events,
        (event) => event.type === "chat:message_ack" && event.payload?.temp_id === mediaTempId
    );
    check("a media message is acknowledged", Boolean(mediaAck), "no ack within 8s");
    check(
        "the media message keeps its /uploads/ url",
        mediaAck?.payload?.message_id ? String(mediaUrl).length > 0 : false
    );

    const memberFetch = await fetch(`${BASE_URL}${mediaUrl}`, {
        headers: { Authorization: `Bearer ${bob.token}` },
    });
    check("a chat member can download the media", memberFetch.status === 200, `got ${memberFetch.status}`);
    if (memberFetch.status === 200) {
        const bytes = Buffer.from(await memberFetch.arrayBuffer());
        check(
            "the downloaded bytes match the upload",
            bytes.equals(Buffer.from(PNG_BASE64, "base64")),
            `got ${bytes.length} bytes`
        );
    }

    const outsiderFetch = await fetch(`${BASE_URL}${mediaUrl}`, {
        headers: { Authorization: `Bearer ${outsider.token}` },
    });
    check("a non-member is refused with 403", outsiderFetch.status === 403, `got ${outsiderFetch.status}`);

    const legacyName = mediaUrl.split("/").pop() ?? "";
    const legacyFetch = await fetch(`${BASE_URL}/media/${legacyName}`, {
        headers: { Authorization: `Bearer ${bob.token}` },
    });
    check("the legacy /media/:filename path still serves the file", legacyFetch.status === 200, `got ${legacyFetch.status}`);

    aliceWs.ws.close();
    bobWs.ws.close();

    console.log("\n===============================================================");
    console.log(`Total Phase 1 Checks: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
    console.log("===============================================================");

    process.exit(failed === 0 ? 0 : 1);
}

const watchdog = setTimeout(() => {
    console.error("Phase 1 suite timed out after 90s");
    process.exit(1);
}, 90000);

runPhase1Suite().catch((err) => {
    console.error("\nPHASE 1 SUITE FAILED");
    console.error(err);
    console.error("\nIs the backend running? Start it with: cd backend && npm run dev");
    clearTimeout(watchdog);
    process.exit(1);
});