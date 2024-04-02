"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const supabase_js_1 = require("@supabase/supabase-js");
dotenv_1.default.config();
const handleRecordingInserted = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const { new: recording } = payload;
    const { data: userProfile, error } = yield supabase
        .from("UserProfile")
        .select(`
      email,
      organization:Organization (
        id,
        name,
        stripeProduct:StripeProduct (
          id,
          policies
        )
      )
    `)
        .eq("id", recording.user_profile_id)
        .maybeSingle();
    if (error || !userProfile) {
        console.error(error);
        return;
    }
    const recordingUsagePolicy = userProfile.organization.stripeProduct
        .policies["max_recordings_prg"];
    if (!recordingUsagePolicy) {
        return;
    }
    const { data: usageData, error: getUsageError } = yield supabase.rpc(recordingUsagePolicy, {
        org_id: userProfile.organization.id,
    });
    if (getUsageError || !usageData) {
        console.error(getUsageError);
        return;
    }
    if (usageData.used < usageData.total) {
        return;
    }
    const response = yield fetch("https://app.loops.so/api/v1/transactional", {
        method: "POST",
        headers: {
            authorization: `Bearer ${process.env.LOOPS_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            email: userProfile.email,
            transactionalId: `${process.env.TRANSACTIONAL_ID}`,
        }),
    });
    if (!response.ok) {
        console.error(`Failed to send email: Status code ${response.status} - ${response.statusText}`);
    }
});
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_KEY || "");
supabase
    .channel("recording_inserted")
    .on("postgres_changes", {
    event: "INSERT",
    schema: "public",
    table: "Recording",
}, handleRecordingInserted)
    .subscribe();
console.log("Listening for Recording INSERT events...");
