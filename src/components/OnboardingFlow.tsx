"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserImage, UserProfile } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ProfileForm } from "@/components/ProfileForm";
import { ImageUploader } from "@/components/ImageUploader";

const STEPS = ["Your profile", "Your photos", "Confirm"] as const;

export function OnboardingFlow({
  initialName,
  initialProfile,
  initialImages,
}: {
  initialName?: string | null;
  initialProfile?: UserProfile | null;
  initialImages: UserImage[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [images, setImages] = useState<UserImage[]>(initialImages);
  const [profileSaved, setProfileSaved] = useState(!!initialProfile);

  const requiredAngles = ["front", "side", "back"];
  const uploadedAngles = new Set(images.map((img) => img.angle));
  const missingAngles = requiredAngles.filter((a) => !uploadedAngles.has(a));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium">
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </span>
          <span className="text-muted-foreground">
            {Math.round(((step + 1) / STEPS.length) * 100)}%
          </span>
        </div>
        <Progress value={((step + 1) / STEPS.length) * 100} />
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <ProfileForm
            initialName={initialName}
            initialProfile={initialProfile}
            submitLabel="Save and continue"
            onSaved={() => {
              setProfileSaved(true);
              setStep(1);
            }}
          />
          {profileSaved && (
            <Button variant="ghost" onClick={() => setStep(1)}>
              Skip ahead →
            </Button>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <ImageUploader initialImages={images} onChange={setImages} />
          {missingAngles.length > 0 && (
            <Alert>
              <AlertDescription>
                Still needed: {missingAngles.join(", ")} photo
                {missingAngles.length > 1 ? "s" : ""}. You can continue, but previews are most
                accurate with all three.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button onClick={() => setStep(2)} disabled={images.length === 0}>
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div className="rounded-lg border p-4">
            <h3 className="mb-2 font-semibold">You&apos;re all set</h3>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>Profile: {profileSaved ? "saved" : "not saved yet"}</li>
              <li>
                Reference photos: {images.length} uploaded
                {missingAngles.length > 0 && ` (missing: ${missingAngles.join(", ")})`}
              </li>
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              You can edit your profile and photos any time from the Profile page.
            </p>
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              size="lg"
              onClick={() => {
                router.push("/dashboard");
                router.refresh();
              }}
            >
              Go to my dashboard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
