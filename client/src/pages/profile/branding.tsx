import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload } from "lucide-react";

export default function Branding() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Branding</h1>
        <p className="text-muted-foreground mt-2">Customize how your tours and emails look.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Logo</CardTitle>
            <CardDescription>Upload your company logo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-10 flex flex-col items-center justify-center text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer group">
              <div className="w-12 h-12 mb-2 bg-muted rounded-full flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <Upload className="w-6 h-6 text-muted-foreground group-hover:text-primary" />
              </div>
              <span className="font-medium group-hover:text-primary transition-colors">Click to upload or drag and drop</span>
              <span className="text-xs mt-1">PNG, JPG or SVG (max 2MB)</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Brand Colors</CardTitle>
            <CardDescription>Set your primary brand color.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="primary-color">Primary Color</Label>
              <div className="flex gap-4 items-center">
                <div className="relative">
                  <div className="w-16 h-16 rounded-lg border shadow-sm overflow-hidden">
                    <input 
                      type="color" 
                      id="primary-color" 
                      defaultValue="#0F172A" 
                      className="absolute -top-2 -left-2 w-24 h-24 cursor-pointer"
                    />
                  </div>
                </div>
                <Input defaultValue="#0F172A" className="font-mono uppercase" maxLength={7} />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="accent-color">Accent Color</Label>
              <div className="flex gap-4 items-center">
                 <div className="relative">
                  <div className="w-16 h-16 rounded-lg border shadow-sm overflow-hidden">
                    <input 
                      type="color" 
                      id="accent-color" 
                      defaultValue="#3B82F6" 
                      className="absolute -top-2 -left-2 w-24 h-24 cursor-pointer"
                    />
                  </div>
                </div>
                <Input defaultValue="#3B82F6" className="font-mono uppercase" maxLength={7} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>This is how your branding will appear on your tour pages.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg p-8 bg-slate-50 dark:bg-slate-900/50">
              <div className="bg-white dark:bg-slate-950 p-6 shadow-lg rounded-lg max-w-2xl mx-auto border">
                <div className="flex items-center justify-between border-b pb-4 mb-4">
                  <div className="font-bold text-xl flex items-center gap-2">
                    <div className="w-8 h-8 bg-primary rounded"></div>
                    YOUR LOGO
                  </div>
                  <div className="text-sm text-muted-foreground">1234 Highland Blvd</div>
                </div>
                <div className="aspect-video bg-muted rounded mb-4 relative overflow-hidden">
                   <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/30 font-bold text-2xl">
                     Listing Photo
                   </div>
                </div>
                <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-muted rounded w-1/2"></div>
                <div className="mt-8 flex justify-center">
                  <Button size="lg" className="w-full sm:w-auto">Book Viewing</Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
