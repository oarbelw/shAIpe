import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";

const FIT_LABELS: Record<string, string> = {
  too_small: "Likely too small",
  tight: "Slightly tight",
  true_to_size: "True to size",
  relaxed: "Relaxed fit",
  too_large: "Likely too large",
};

const FIT_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  too_small: "destructive",
  tight: "secondary",
  true_to_size: "default",
  relaxed: "secondary",
  too_large: "destructive",
};

export function FitAnalysisCard({
  fitPrediction,
  recommendedSize,
  confidence,
  explanation,
  warnings,
}: {
  fitPrediction?: string | null;
  recommendedSize?: string | null;
  confidence?: number | null;
  explanation?: string | null;
  warnings?: string[];
}) {
  if (!fitPrediction && !explanation) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Fit analysis
          {fitPrediction && (
            <Badge variant={FIT_VARIANTS[fitPrediction] ?? "outline"}>
              {FIT_LABELS[fitPrediction] ?? fitPrediction}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {recommendedSize && (
          <p className="text-sm">
            <span className="text-muted-foreground">Recommended size:</span>{" "}
            <span className="font-semibold">{recommendedSize}</span>
          </p>
        )}

        {typeof confidence === "number" && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Confidence</span>
              <span>{Math.round(confidence * 100)}%</span>
            </div>
            <Progress value={confidence * 100} />
          </div>
        )}

        {explanation && <p className="text-sm leading-relaxed">{explanation}</p>}

        {warnings && warnings.length > 0 && (
          <Alert>
            <AlertDescription>
              <ul className="list-disc space-y-1 pl-4">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
