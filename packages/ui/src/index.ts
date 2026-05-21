import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export { Badge } from "./components/badge";
export { Button } from "./components/button";
export { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./components/card";
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/tabs";
export { Input } from "./components/input";
export { Label } from "./components/label";
export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./components/select";
export { ScrollArea } from "./components/scroll-area";
export { Progress } from "./components/progress";
