import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@/context/ThemeContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { Info, CheckCircle } from 'lucide-react';

function DesignSystemDemo() {
  return (
    <div className="container mx-auto p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-primary">SnapFlow V2</h1>
          <p className="text-muted-foreground mt-1">Corporate Design System</p>
        </div>
        <ThemeToggle />
      </div>

      <Separator />

      {/* Brand Colors */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Brand Colors</h2>
        <div className="flex gap-4">
          <div className="flex flex-col items-center gap-2">
            <div className="w-20 h-20 rounded-lg bg-[#8C00AA]" />
            <span className="text-sm font-medium">Primary</span>
            <span className="text-xs text-muted-foreground">#8C00AA</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="w-20 h-20 rounded-lg bg-[#A020C0]" />
            <span className="text-sm font-medium">Light</span>
            <span className="text-xs text-muted-foreground">#A020C0</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="w-20 h-20 rounded-lg bg-[#6A0080]" />
            <span className="text-sm font-medium">Dark</span>
            <span className="text-xs text-muted-foreground">#6A0080</span>
          </div>
        </div>
      </section>

      <Separator />

      {/* Buttons */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Buttons</h2>
        <div className="flex flex-wrap gap-4">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
        </div>
        <div className="flex flex-wrap gap-4 mt-4">
          <Button size="sm">Small</Button>
          <Button>Default</Button>
          <Button size="lg">Large</Button>
        </div>
      </section>

      <Separator />

      {/* Form Elements */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Form Elements</h2>
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Login Form</CardTitle>
            <CardDescription>Example form with corporate styling</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="name@company.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" />
            </div>
            <div className="flex items-center space-x-2">
              <Switch id="remember" />
              <Label htmlFor="remember" className="text-sm font-normal">
                Remember me
              </Label>
            </div>
            <Button className="w-full">Sign In</Button>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* Badges */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Badges</h2>
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="destructive">Error</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </section>

      <Separator />

      {/* Alerts */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Alerts</h2>
        <div className="space-y-4 max-w-2xl">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Info</AlertTitle>
            <AlertDescription>
              This is an informational alert message.
            </AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              Something went wrong. Please try again.
            </AlertDescription>
          </Alert>
        </div>
      </section>

      <Separator />

      {/* Cards */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Cards</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Feature One</CardTitle>
              <CardDescription>Description text</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Card content goes here with proper spacing and typography.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Feature Two</CardTitle>
              <CardDescription>Description text</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Consistent styling across all cards in the application.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Feature Three</CardTitle>
              <CardDescription>Description text</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Ready for desktop application with dense information display.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator />

      {/* Theme Info */}
      <section className="bg-muted p-6 rounded-lg">
        <h2 className="text-xl font-semibold mb-2">Theme System</h2>
        <p className="text-muted-foreground mb-4">
          This design system uses CSS variables for theming. The primary color is your 
          corporate purple (#8C00AA). Dark mode is ready to use - just toggle above!
        </p>
        <div className="flex gap-2">
          <Badge variant="outline">Light Theme Active</Badge>
          <Badge variant="outline">Dark Theme Ready</Badge>
          <Badge variant="outline">User Customizable</Badge>
        </div>
      </section>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<DesignSystemDemo />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
