import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export default function SellerFlow() {
  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Seller Details</h1>
        <p className="text-muted-foreground mt-2">Information about the property seller for this listing.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contact Information</CardTitle>
          <CardDescription>Who should we contact for access?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first-name">Seller First Name</Label>
              <Input id="first-name" placeholder="Jane" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last-name">Seller Last Name</Label>
              <Input id="last-name" placeholder="Smith" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Seller Email (Optional)</Label>
            <Input id="email" type="email" placeholder="jane@example.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Seller Phone</Label>
            <Input id="phone" type="tel" placeholder="(555) 123-4567" />
          </div>
          <div className="space-y-2">
            <Label>Notification Preferences</Label>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Select preference" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email Only</SelectItem>
                <SelectItem value="sms">SMS Only</SelectItem>
                <SelectItem value="both">Both Email & SMS</SelectItem>
                <SelectItem value="none">Don't contact seller</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline">Back</Button>
          <Button>Next Step</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
