import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function ServicePreferences() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Service Preferences</h1>
        <p className="text-muted-foreground mt-2">Customize your default service settings.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Photography Settings</CardTitle>
          <CardDescription>Defaults for your photo shoots.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between space-x-2">
            <Label htmlFor="sky" className="flex flex-col space-y-1">
              <span>Blue Sky Replacement</span>
              <span className="font-normal text-xs text-muted-foreground">Automatically replace cloudy skies with blue ones.</span>
            </Label>
            <Switch id="sky" defaultChecked />
          </div>
          <div className="flex items-center justify-between space-x-2">
            <Label htmlFor="tv" className="flex flex-col space-y-1">
              <span>TV Screen Replacement</span>
              <span className="font-normal text-xs text-muted-foreground">Add an image to black TV screens.</span>
            </Label>
            <Switch id="tv" defaultChecked />
          </div>
          <div className="flex items-center justify-between space-x-2">
            <Label htmlFor="fire" className="flex flex-col space-y-1">
              <span>Virtual Fireplaces</span>
              <span className="font-normal text-xs text-muted-foreground">Add fire to fireplaces.</span>
            </Label>
            <Switch id="fire" defaultChecked />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery Preferences</CardTitle>
          <CardDescription>How you receive your files.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between space-x-2">
            <Label htmlFor="mls" className="flex flex-col space-y-1">
              <span>Auto-Upload to MLS</span>
              <span className="font-normal text-xs text-muted-foreground">Automatically push photos to your MLS listing.</span>
            </Label>
            <Switch id="mls" />
          </div>
          <div className="flex items-center justify-between space-x-2">
            <Label htmlFor="print" className="flex flex-col space-y-1">
              <span>Print Quality Files</span>
              <span className="font-normal text-xs text-muted-foreground">Always include high-resolution print files.</span>
            </Label>
            <Switch id="print" defaultChecked />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
