import { NavLink, useLocation } from "react-router-dom";
import { FalcoLockup } from "@/components/brand/FalcoLockup";
import { isCurrent, NAV_GROUPS } from "@/components/layout/nav";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar className="border-r-0 shadow-card md:shadow-[1px_0_8px_rgba(0,0,0,0.04)]">
      <SidebarHeader className="h-14 justify-center px-4 py-0">
        <NavLink to="/" aria-label="Falco Studio home" onClick={() => setOpenMobile(false)}>
          <FalcoLockup suffix="by Salto Ángel" />
        </NavLink>
      </SidebarHeader>
      <SidebarContent className="px-2 pt-2">
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label} className="px-0 py-1.5">
            <SidebarGroupLabel className="h-7 px-2 label-caps text-text-3">{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => {
                  const active = isCurrent(pathname, item.to);
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        className="h-auto rounded-md px-2 py-1.5 text-body text-muted-foreground hover:bg-surface-high hover:text-foreground data-[active=true]:bg-brand-tint data-[active=true]:font-semibold data-[active=true]:text-primary [&>svg]:size-[18px]"
                      >
                        <NavLink to={item.to} end={item.to === "/"} onClick={() => setOpenMobile(false)}>
                          <item.icon />
                          <span>{item.label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="px-4 pb-4">
        <p className="font-mono text-code-sm text-text-3">Salto Angel AI</p>
      </SidebarFooter>
    </Sidebar>
  );
}
