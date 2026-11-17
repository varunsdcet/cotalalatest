import { Spinner } from "@/components/ui/spinner";

type Props = {
  overlay?: boolean;
  className?: string;
};

export default function KitLoader({ overlay, className }: Props) {
  if (overlay) {
    return (
      <div className={`absolute inset-0 flex items-center justify-center bg-black/40 ${className ?? ""}`}>
        <Spinner className="size-9 text-[#B082F2]" />
      </div>
    );
  }
  return (
    <div className={`flex items-center justify-center py-16 ${className ?? ""}`}>
      <Spinner className="size-9 text-[#B082F2]" />
    </div>
  );
}
