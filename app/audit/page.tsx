'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { Spinner } from '@/components/ui/spinner'
import { CheckCircle, X, AlertCircle } from 'lucide-react'

interface AuditItem {
  id: string
  audit_type: string
  status: string
  suggested_value: Record<string, unknown>
  created_at: string
}

export default function AuditPage() {
  const [items, setItems] = useState<AuditItem[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    fetchAuditItems()
  }, [])

  const fetchAuditItems = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('audit_items')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (error) throw error

      setItems(data || [])
    } catch (error) {
      console.error('Error fetching audit items:', error)
      toast({
        title: 'Error',
        description: 'Failed to load audit items',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (id: string) => {
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('audit_items')
        .update({ status: 'approved', resolved_at: new Date().toISOString() })
        .eq('id', id)

      if (error) throw error

      setItems(items.filter((item) => item.id !== id))
      toast({
        title: 'Approved',
        description: 'Audit item approved and applied',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to approve item',
        variant: 'destructive',
      })
    }
  }

  const handleReject = async (id: string) => {
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('audit_items')
        .update({ status: 'rejected', resolved_at: new Date().toISOString() })
        .eq('id', id)

      if (error) throw error

      setItems(items.filter((item) => item.id !== id))
      toast({
        title: 'Rejected',
        description: 'Audit item dismissed',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to reject item',
        variant: 'destructive',
      })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Audit Inbox</h1>
        <p className="text-muted-foreground">
          Review and validate {items.length} pending items
        </p>
      </div>

      {items.length === 0 ? (
        <Card className="p-8 text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <p className="text-lg font-semibold mb-2">All Caught Up!</p>
          <p className="text-muted-foreground">No pending audit items</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <Card key={item.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    <span className="font-semibold text-sm bg-amber-100 text-amber-800 px-2 py-1 rounded">
                      {item.audit_type.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    {JSON.stringify(item.suggested_value)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="flex gap-2 ml-4">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => handleApprove(item.id)}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleReject(item.id)}
                  >
                    <X className="w-4 h-4 mr-1" />
                    Reject
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
