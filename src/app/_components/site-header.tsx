import Link from "next/link"

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu"
import { AuthStatus } from "./auth-status"

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between px-6">
        <Link href="/" className="text-sm font-semibold">
          SERP DR
        </Link>

        <div className="flex items-center gap-2">
          <NavigationMenu viewport={false}>
            <NavigationMenuList>
              <NavigationMenuItem>
                <Link href="/" className={navigationMenuTriggerStyle()}>
                  Home
                </Link>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <Link href="/sites" className={navigationMenuTriggerStyle()}>
                  Sites
                </Link>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <Link href="/pricing" className={navigationMenuTriggerStyle()}>
                  Pricing
                </Link>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
          <AuthStatus />
        </div>
      </div>
    </header>
  )
}
