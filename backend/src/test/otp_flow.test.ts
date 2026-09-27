/**
 * Phase 1 auth regression suite: OTP issuance, consumption and abuse limits.
 *
 * Covers the hardening in OTPService (one-time use, attempt lockout, resend
 * cooldown, unbiased generation) plus the AuthService entry points behind
 *                     /auth/request-otp and /auth/verify-otp.
 *
 * Runs entirely in-process, so no backend server is required.
 *
 * Run: npm run test:otp
 */
import { OTPService } from "../services/otp.service.js";
import { AuthService } from "../services/auth.service.js";
import { initDatabase } from "../db/index.js";
import { config } from "../config/index.js";
import { emitTestSuiteStarted, emitTestSuiteCompleted } from "./testEventEmitter.js";

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

/**
 * Freeze wall-clock time so 5-minute expiry and 30-second cooldown windows can
 * be asserted without actually waiting for them.
 */
function freezeClock(startMs: number) {
    const realNow = Date.now;
    let now = startMs;
    Date.now = () => now;
    return {
        advance(ms: number) {
            now += ms;
        },
        restore() {
            Date.now = realNow;
        },
    };
}

async function runOtpSuite(): Promise<void> {
    console.log("===============================================================");
    console.log("PHASE 1 AUTH - OTP FLOW SUITE");
    console.log("===============================================================\n");

    emitTestSuiteStarted("otp");

    // ---- 1. Code generation ------------------------------------------------
    console.log("1) Code generation");
    const codes = Array.from({ length: 300 }, () => OTPService.generateOTP());
    check("every generated code is exactly 6 digits", codes.every((c) => /^\d{6}$/.test(c)));
    check(
        "generated codes stay inside 100000-999999",
        codes.every((c) => Number(c) >= 100000 && Number(c) <= 999999)
    );
    check("generated codes are not constant", new Set(codes).size > 250, `distinct=${new Set(codes).size}/300`);

    // ---- 2. Happy path and one-time use -----------------------------------
    console.log("\n2) Verification and replay protection");
    const oneTimeId = "+15550000001";
    OTPService.storeOTP(oneTimeId, "123456");
    check("the correct code is accepted", OTPService.verifyOTP(oneTimeId, "123456") === true);
    check("the same code cannot be replayed", OTPService.verifyOTP(oneTimeId, "123456") === false);

    // ---- 3. Wrong guess does not consume a valid code ---------------------
    console.log("\n3) Wrong guesses");
    const wrongId = "+15550000002";
    OTPService.storeOTP(wrongId, "654321");
    check("a wrong code is rejected", OTPService.verifyOTP(wrongId, "000000") === false);
    check("the real code still works after one wrong guess", OTPService.verifyOTP(wrongId, "654321") === true);

    // ---- 4. Brute-force lockout -------------------------------------------
    console.log("\n4) Brute-force lockout");
    const lockId = "+15550000003";
    OTPService.storeOTP(lockId, "111111");
    for (let attempt = 0; attempt < 5; attempt++) {
        OTPService.verifyOTP(lockId, "222222");
    }
    check("five wrong guesses invalidate the code", OTPService.verifyOTP(lockId, "111111") === false);

    // ---- 5-7. Time-dependent behaviour -----------------------------------
    const clock = freezeClock(Date.now());
    try {
        console.log("\n5) Expiry window");
        const expiryId = "+15550000004";
        OTPService.storeOTP(expiryId, "333333");
        clock.advance(OTPService.OTP_EXPIRY_TIME + 1000);
        check("a code past its validity window is rejected", OTPService.verifyOTP(expiryId, "333333") === false);

        console.log("\n6) Resend cooldown");
        const cooldownId = "+15550000005";
        OTPService.storeOTP(cooldownId, "444444");
        check("a cooldown is reported right after sending", OTPService.getResendCooldownSeconds(cooldownId) > 0);
        clock.advance(OTPService.RESEND_COOLDOWN_TIME + 1000);
        check("the cooldown clears once the window passes", OTPService.getResendCooldownSeconds(cooldownId) === 0);

        console.log("\n7) Non-consuming read");
        const peekId = "+15550000006";
        OTPService.storeOTP(peekId, "555555");
        check("peekOTP returns the stored code", OTPService.peekOTP(peekId) === "555555");
        check("peekOTP does not consume the code", OTPService.verifyOTP(peekId, "555555") === true);
    } finally {
        clock.restore();
    }

    // ---- 8-12. AuthService contract --------------------------------------
    initDatabase();
    console.log("\n8) AuthService.requestOTP contract");
    const phone = `+1555${String(Date.now()).slice(-7)}`;
    const issued = await AuthService.requestOTP({ phoneNumber: phone });
    check("the 5 minute validity window is reported", issued.expiresInSeconds === 300, `got ${issued.expiresInSeconds}`);
    check("the 30s resend cooldown is reported", issued.resendAfterSeconds === 30, `got ${issued.resendAfterSeconds}`);

    if (config.isProduction) {
        check("production never echoes the OTP", issued.devCode === undefined);
    } else {
        check(
            "dev builds echo a 6-digit code (no SMS provider needed)",
            typeof issued.devCode === "string" && /^\d{6}$/.test(issued.devCode),
            `got ${JSON.stringify(issued.devCode)}`
        );
        check("the echoed code matches the stored one", OTPService.peekOTP(phone) === issued.devCode);
    }

    console.log("\n9) Abuse limits on request-otp");
    let throttled = false;
    try {
        await AuthService.requestOTP({ phoneNumber: phone });
    } catch (err: any) {
        throttled = /Please wait/.test(err.message || "");
    }
    check("an immediate resend for the same number is throttled", throttled);

    let emptyRejected = false;
    try {
        await AuthService.requestOTP({ phoneNumber: "   " });
    } catch {
        emptyRejected = true;
    }
    check("an empty phone number is rejected", emptyRejected);

    console.log("\n10) verify-otp sign in");
    const code = OTPService.peekOTP(phone) as string;
    const signedIn = await AuthService.verifyOTPAndSignIn({ phoneNumber: phone, otp: code });
    check("an access token is issued", typeof signedIn.token === "string" && signedIn.token.length > 20);
    check("a refresh token is issued", typeof signedIn.refreshToken === "string" && signedIn.refreshToken.length > 10);
    check("the session id is issued", typeof signedIn.sessionId === "string" && signedIn.sessionId.length > 5);
    check(
        "the returned user owns the verified phone number",
        (signedIn.user as any).phone_number === phone,
        `got ${(signedIn.user as any).phone_number}`
    );

    let replayRejected = false;
    try {
        await AuthService.verifyOTPAndSignIn({ phoneNumber: phone, otp: code });
    } catch (err: any) {
        replayRejected = /Invalid or expired OTP/.test(err.message || "");
    }
    check("a consumed code cannot sign in a second time", replayRejected);

    console.log("\n===============================================================");
    console.log(`Total OTP Checks: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
    console.log("===============================================================");
    emitTestSuiteCompleted("otp", passed, failed, passed + failed);

    process.exit(failed === 0 ? 0 : 1);
}

runOtpSuite().catch((err) => {
    console.error("Fatal OTP suite failure:", err);
    process.exit(1);
});