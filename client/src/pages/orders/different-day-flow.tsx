import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";

export default function DifferentDayFlow() {
  const [date, setDate] = useState<Date | undefined>(new Date());

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Split Appointment</h1>
        <p className="text-muted-foreground mt-2">Schedule services on different days if needed.</p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Note</AlertTitle>
        <AlertDescription>
          Splitting services across multiple days may incur additional travel fees.
        </AlertDescription>
      </Alert>

      <div className="grid md:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Photography Session</CardTitle>
            <CardDescription>Select a date for photography.</CardDescription>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              className="rounded-md border"
            />
            <div className="mt-4 space-y-3">
              <Label>Time Slot</Label>
              <RadioGroup defaultValue="morning">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="morning" id="r1" />
                  <Label htmlFor="r1">Morning (9AM - 12PM)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="afternoon" id="r2" />
                  <Label htmlFor="r2">Afternoon (12PM - 4PM)</Label>
                </div>
              </RadioGroup>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Floor Plan Measurement</CardTitle>
            <CardDescription>Select a separate date for measurements.</CardDescription>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              className="rounded-md border"
            />
             <div className="mt-4 space-y-3">
              <Label>Time Slot</Label>
              <RadioGroup defaultValue="anytime">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="anytime" id="r3" />
                  <Label htmlFor="r3">Anytime (9AM - 5PM)</Label>
                </div>
              </RadioGroup>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-4">
        <Button variant="outline">Cancel</Button>
        <Button>Confirm Split Schedule</Button>
      </div>
    </div>
  );
}
