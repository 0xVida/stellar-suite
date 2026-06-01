import { Bell } from "lucide-react";
import { useNotificationStore } from "@/store/useNotificationStore";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function NotificationCenter() {
  const { notifications, markAsRead, clearAll } = useNotificationStore();

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          aria-label="Open notifications"
        >
          <Bell size={20} />

          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 flex items-center justify-center text-[10px]"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DrawerTrigger>

      <DrawerContent className="p-4 max-h-[80vh] overflow-y-auto">
        <DrawerHeader>
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Notifications</h2>

            {notifications.length > 0 && (
              <Button
                variant="link"
                size="sm"
                onClick={clearAll}
                className="text-destructive h-auto p-0"
              >
                Clear All
              </Button>
            )}
          </div>
        </DrawerHeader>

        <div className="space-y-2 mt-4">
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No notifications yet
            </p>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => markAsRead(n.id)}
                className={`p-3 rounded-md cursor-pointer border transition ${
                  n.read
                    ? "opacity-60 border-border"
                    : "bg-muted border-primary/30"
                }`}
              >
                <p className="text-sm">{n.message}</p>

                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-muted-foreground">
                    {new Date(n.timestamp).toLocaleTimeString()}
                  </span>

                  {!n.read && (
                    <Badge variant="secondary" className="text-[10px] py-0 px-1">
                      NEW
                    </Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}