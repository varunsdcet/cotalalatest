import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, CheckCircle2, Clock, DollarSign, Home as HomeIcon, MapPin, MoreHorizontal } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

export default function Home() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Welcome back, here's what's happening today.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/new-appointment">
            <Button>New Appointment</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Listings</CardTitle>
            <HomeIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">128</div>
            <p className="text-xs text-muted-foreground">+12% from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Orders</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
            <p className="text-xs text-muted-foreground">+2 new today</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">24</div>
            <p className="text-xs text-muted-foreground">In the last 7 days</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$1,234.56</div>
            <p className="text-xs text-muted-foreground">Next invoice due in 5 days</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
            <CardDescription>You have 3 orders scheduled for this week.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary/10 text-primary">OM</AvatarFallback>
                  </Avatar>
                  <div className="ml-4 space-y-1">
                    <p className="text-sm font-medium leading-none">Order #{1000 + i}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> 1234 Main St, Vancouver BC
                    </p>
                  </div>
                  <div className="ml-auto font-medium text-sm">
                    {i % 2 === 0 ? (
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Processing</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Completed</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Upcoming Appointments</CardTitle>
            <CardDescription>Your schedule for the next few days.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {[
                { date: "Today, 2:00 PM", title: "Photography Session", address: "456 Oak Avenue" },
                { date: "Tomorrow, 10:00 AM", title: "Floor Plan Measurement", address: "789 Pine Street" },
                { date: "Wed, Dec 20, 1:00 PM", title: "Video Tour", address: "101 Maple Drive" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-4 p-3 rounded-lg border bg-muted/30">
                  <div className="flex flex-col items-center justify-center w-12 h-12 rounded bg-background border text-center">
                    <span className="text-xs font-bold text-primary uppercase">{item.date.split(',')[0]}</span>
                    <span className="text-lg font-bold">{i + 18}</span>
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold">{item.title}</h4>
                    <p className="text-xs text-muted-foreground">{item.address}</p>
                    <p className="text-xs font-medium text-primary">{item.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
