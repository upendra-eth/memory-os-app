'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { LifeLog } from '@/lib/types'
import { deleteLog } from '@/app/actions'
import { Trash2, ChevronDown, ChevronUp, Clock, Database } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface LogExplorerProps {
  initialLogs: LifeLog[]
  total: number
}

export function LogExplorer({ initialLogs, total }: LogExplorerProps) {
  const [logs, setLogs] = useState(initialLogs)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleDelete = async () => {
    if (!deleteId) return
    
    setIsDeleting(true)
    try {
      const result = await deleteLog(deleteId)
      if (result.success) {
        setLogs((prev) => prev.filter((log) => log.id !== deleteId))
        toast.success('Log deleted successfully')
      } else {
        toast.error('Failed to delete', { description: result.error })
      }
    } catch (error) {
      toast.error('Failed to delete', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsDeleting(false)
      setDeleteId(null)
    }
  }

  const getLogPreview = (content: Record<string, unknown>): string => {
    const type = content.type as string | undefined
    const date = content.date as string | undefined
    const name = content.name as string | undefined
    
    const parts = []
    if (type) parts.push(type)
    if (name) parts.push(name)
    if (date) parts.push(date)
    
    if (parts.length > 0) return parts.join(' - ')
    
    const keys = Object.keys(content).slice(0, 3)
    return keys.join(', ') + (Object.keys(content).length > 3 ? '...' : '')
  }

  if (logs.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Database className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-lg font-semibold text-foreground">No logs yet</h3>
            <p className="text-muted-foreground max-w-sm">
              Start by adding some data through the Paste Ingestor to see your logs here.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {logs.map((log) => {
          const isExpanded = expandedIds.has(log.id)
          
          return (
            <Card key={log.id} className="overflow-hidden">
              <CardHeader 
                className="cursor-pointer hover:bg-secondary/50 transition-colors py-3"
                onClick={() => toggleExpand(log.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0">
                      <Database className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-sm font-medium truncate">
                        {getLogPreview(log.content)}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-1 text-xs">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteId(log.id)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Delete log</span>
                    </Button>
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </CardHeader>
              
              {isExpanded && (
                <CardContent className="pt-0 pb-4">
                  <ScrollArea className="max-h-[400px]">
                    <pre className="text-xs font-mono bg-secondary/50 rounded-lg p-4 overflow-auto text-foreground">
                      {JSON.stringify(log.content, null, 2)}
                    </pre>
                  </ScrollArea>
                  <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                    <span>ID: {log.id}</span>
                    <span>Created: {new Date(log.created_at).toLocaleString()}</span>
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })}
        
        {total > logs.length && (
          <p className="text-center text-sm text-muted-foreground py-4">
            Showing {logs.length} of {total} logs
          </p>
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this log?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this log entry from your database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
