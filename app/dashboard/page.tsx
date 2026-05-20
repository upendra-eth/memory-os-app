'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Heart, TrendingUp, MessageSquare, FileText } from 'lucide-react'
import Link from 'next/link'

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Welcome to Memory OS</h1>
          <p className="text-muted-foreground text-lg">
            Your personal health and life logging companion
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="p-6 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-200/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">BMI</p>
                <p className="text-3xl font-bold">24.2</p>
              </div>
              <Heart className="w-8 h-8 text-emerald-600" />
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border-cyan-200/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">TDEE</p>
                <p className="text-3xl font-bold">2,450</p>
                <p className="text-xs text-muted-foreground">kcal/day</p>
              </div>
              <TrendingUp className="w-8 h-8 text-cyan-600" />
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-violet-500/10 to-violet-600/5 border-violet-200/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Entries</p>
                <p className="text-3xl font-bold">0</p>
                <p className="text-xs text-muted-foreground">this week</p>
              </div>
              <FileText className="w-8 h-8 text-violet-600" />
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-200/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Insights</p>
                <p className="text-3xl font-bold">0</p>
                <p className="text-xs text-muted-foreground">pending</p>
              </div>
              <MessageSquare className="w-8 h-8 text-orange-600" />
            </div>
          </Card>
        </div>

        {/* Main Features */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Add Entry - Primary CTA */}
          <Card className="p-6 hover:shadow-lg transition-shadow lg:col-span-1 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
            <div className="mb-4">
              <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center mb-3">
                <FileText className="w-6 h-6 text-primary-foreground" />
              </div>
              <h3 className="text-xl font-semibold">Add Entry</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Paste your ChatGPT output with AI-powered normalization
              </p>
            </div>
            <Link href="/add">
              <Button className="w-full">Add Entry Now</Button>
            </Link>
          </Card>

          {/* Chat Interface */}
          <Card className="p-6 hover:shadow-lg transition-shadow">
            <div className="mb-4">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-3">
                <MessageSquare className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Ask AI</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Ask questions about your health data with AI insights
              </p>
            </div>
            <Link href="/chat">
              <Button className="w-full">Ask Questions</Button>
            </Link>
          </Card>

          {/* Data Explorer */}
          <Card className="p-6 hover:shadow-lg transition-shadow">
            <div className="mb-4">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-3">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Raw Explorer</h3>
              <p className="text-sm text-muted-foreground mt-1">
                View and explore all your logged data
              </p>
            </div>
            <Link href="/explorer">
              <Button className="w-full">Explore Data</Button>
            </Link>
          </Card>
        </div>

        {/* Feature Tabs (Placeholder for Phase 3+) */}
        <Card className="p-6">
          <Tabs defaultValue="timeline" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="body">Body</TabsTrigger>
              <TabsTrigger value="nutrition">Nutrition</TabsTrigger>
              <TabsTrigger value="profile">Profile</TabsTrigger>
            </TabsList>
            <TabsContent value="timeline" className="mt-4">
              <div className="text-center py-8">
                <p className="text-muted-foreground">Timeline view coming in Phase 3</p>
              </div>
            </TabsContent>
            <TabsContent value="body" className="mt-4">
              <div className="text-center py-4">
                <Link href="/dashboard/body-mood">
                  <Button>View Body & Mood Dashboard</Button>
                </Link>
              </div>
            </TabsContent>
            <TabsContent value="nutrition" className="mt-4">
              <div className="text-center py-4">
                <Link href="/dashboard/nutrition-fitness">
                  <Button>View Nutrition & Fitness Dashboard</Button>
                </Link>
              </div>
            </TabsContent>
            <TabsContent value="profile" className="mt-4">
              <div className="text-center py-8">
                <p className="text-muted-foreground">Profile dashboard coming in Phase 4</p>
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  )
}
