import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function PostSkeleton() {
  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row items-start gap-4 pb-2">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-5 w-32 mb-2" />
          <Skeleton className="h-4 w-24" />
        </div>
      </CardHeader>
      <CardContent className="pb-0">
        <Skeleton className="h-20 w-full mb-4" />
        <Skeleton className="h-[200px] w-full rounded-lg" />
      </CardContent>
      <CardFooter className="flex gap-2 border-t pt-3">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 flex-1" />
      </CardFooter>
    </Card>
  )
}