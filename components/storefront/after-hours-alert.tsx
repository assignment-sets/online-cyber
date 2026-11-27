import { MoonIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface AfterHoursAlertProps {
  closedNotice?: string;
}

const DEFAULT_CLOSED_NOTICE =
  "You can still submit a request and get a Work Token. Work starts when the shop reopens.";

export function AfterHoursAlert({ closedNotice }: AfterHoursAlertProps) {
  const notice = closedNotice?.trim() || DEFAULT_CLOSED_NOTICE;

  return (
    <Alert variant="warning">
      <MoonIcon aria-hidden="true" />
      <AlertTitle>Shop Is Closed Right Now</AlertTitle>
      <AlertDescription>
        <p>{notice}</p>
      </AlertDescription>
    </Alert>
  );
}
