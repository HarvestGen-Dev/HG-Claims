import Image from "next/image";
import logo from "../../logo.jpeg";
import { cn } from "@/lib/utils/cn";

export function BrandLogo({ className, priority = false }: { className?: string; priority?: boolean }) {
  return <Image src={logo} alt="New Life Community Church" priority={priority}
    className={cn("block h-auto w-36 max-w-full shrink-0 bg-white object-contain", className)} />;
}
