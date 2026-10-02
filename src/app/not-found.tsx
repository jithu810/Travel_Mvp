import Link from "next/link";
import { PageHeading } from "@/components/ui/page-heading";

export default function NotFound() {
  return <>
    <PageHeading eyebrow="404" title="This path ends here." description="We couldn't find that page." />
    <Link href="/" className="inline-flex min-h-11 items-center underline underline-offset-4">Return to Journey</Link>
  </>;
}
