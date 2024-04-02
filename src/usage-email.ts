import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

type RecordType = {
  email: string;
  organization: {
    id: number;
    name: string;
    stripeProduct: {
      id: number;
      policies: Record<string, any>;
    };
  };
};

const handleRecordingInserted = async (payload: any) => {
  const { new: recording } = payload;

  const { data: userProfile, error } = await supabase
    .from("UserProfile")
    .select(
      `
      email,
      organization:Organization (
        id,
        name,
        stripeProduct:StripeProduct (
          id,
          policies
        )
      )
    `,
    )
    .eq("id", recording.user_profile_id)
    .maybeSingle();

  if (error || !userProfile) {
    console.error(error);
    return;
  }

  const recordingUsagePolicy = (userProfile as unknown as RecordType).organization.stripeProduct
    .policies["max_recordings_prg"];
  if (!recordingUsagePolicy) {
    return;
  }

  const { data: usageData, error: getUsageError } = await supabase.rpc(recordingUsagePolicy, {
    org_id: (userProfile as unknown as RecordType).organization.id,
  });

  if (getUsageError || !usageData) {
    console.error(getUsageError);
    return;
  }

  if (usageData.used < usageData.total) {
    return;
  }

  const response = await fetch("https://app.loops.so/api/v1/transactional", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.LOOPS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: (userProfile as unknown as RecordType).email,
      transactionalId: `${process.env.TRANSACTIONAL_ID}`,
    }),
  });

  if (!response.ok) {
    console.error(`Failed to send email: Status code ${response.status} - ${response.statusText}`);
  }
};

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_KEY || "",
);

supabase
  .channel("recording_inserted")
  .on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "Recording",
    },
    handleRecordingInserted,
  )
  .subscribe();

console.log("Listening for Recording INSERT events...");
