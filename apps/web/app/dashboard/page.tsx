import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Video,
  Plus,
  Calendar,
  Clock,
  Users,
  Play,
  Settings,
  Search,
  Filter,
  MoreHorizontal,
  Copy,
  Edit,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export default function Dashboard() {
  const meetings = [
    {
      id: 1,
      title: "Weekly Team Standup",
      date: "Today, 2:00 PM",
      duration: "45 min",
      participants: 5,
      status: "upcoming",
      type: "recurring",
    },
    {
      id: 2,
      title: "Product Demo Recording",
      date: "Yesterday, 10:00 AM",
      duration: "1h 20min",
      participants: 3,
      status: "completed",
      type: "recording",
    },
    {
      id: 3,
      title: "Client Interview Session",
      date: "Dec 5, 3:30 PM",
      duration: "30 min",
      participants: 2,
      status: "scheduled",
      type: "interview",
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/" className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                  <Video className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold">StreamStudio</span>
              </Link>
              <nav className="hidden md:flex items-center space-x-6">
                <Link href="/dashboard" className="text-purple-600 font-medium">
                  Dashboard
                </Link>
                <Link href="#" className="text-gray-600 hover:text-gray-900">
                  Recordings
                </Link>
                <Link href="#" className="text-gray-600 hover:text-gray-900">
                  Analytics
                </Link>
              </nav>
            </div>

            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="icon">
                <Settings className="w-5 h-5" />
              </Button>
              <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-medium">JD</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome back, John!</h1>
          <p className="text-gray-600">Ready to create some amazing content today?</p>
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Link href="/meeting/new">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 border-dashed border-purple-200 hover:border-purple-400">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Plus className="w-6 h-6 text-purple-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Start New Meeting</h3>
                <p className="text-sm text-gray-600">Begin recording immediately</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/meeting/schedule">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2
             hover:border-2 border-dashed hover:border-dashed hover:border-blue-400">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Calendar className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Schedule Meeting</h3>
                <p className="text-sm text-gray-600">Plan for later</p>
              </CardContent>
            </Card>
          </Link>
          <Link href={"/meeting/123"}>
            <Card className="hover:shadow-lg transition-shadow cursor-pointer
          hover:border-2 border-2 border-dashed hover:border-dashed hover:border-green-400">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Video className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Join Meeting</h3>
                <p className="text-sm text-gray-600">Enter meeting ID</p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Recent Meetings */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Meetings</CardTitle>
              <div className="flex items-center space-x-2">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <Input placeholder="Search meetings..." className="pl-10 w-64" />
                </div>
                <Button variant="outline" size="icon">
                  <Filter className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {meetings.map((meeting) => (
                <div
                  key={meeting.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center space-x-4">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${meeting.status === "completed"
                          ? "bg-green-100"
                          : meeting.status === "upcoming"
                            ? "bg-blue-100"
                            : "bg-gray-100"
                        }`}
                    >
                      {meeting.status === "completed" ? (
                        <Play className={`w-5 h-5 text-green-600`} />
                      ) : (
                        <Video
                          className={`w-5 h-5 ${meeting.status === "upcoming" ? "text-blue-600" : "text-gray-600"}`}
                        />
                      )}
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">{meeting.title}</h3>
                      <div className="flex items-center space-x-4 text-sm text-gray-600">
                        <div className="flex items-center space-x-1">
                          <Clock className="w-4 h-4" />
                          <span>{meeting.date}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Users className="w-4 h-4" />
                          <span>{meeting.participants} participants</span>
                        </div>
                        <span>Duration: {meeting.duration}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <Badge
                      variant={
                        meeting.status === "completed"
                          ? "default"
                          : meeting.status === "upcoming"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {meeting.status}
                    </Badge>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {meeting.status === "upcoming" && (
                          <DropdownMenuItem>
                            <Link href={`/meeting/${meeting.id}`} className="flex items-center">
                              <Video className="w-4 h-4 mr-2" />
                              Join Meeting
                            </Link>
                          </DropdownMenuItem>
                        )}
                        {meeting.status === "completed" && (
                          <DropdownMenuItem>
                            <Play className="w-4 h-4 mr-2" />
                            View Recording
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem>
                          <Copy className="w-4 h-4 mr-2" />
                          Copy Link
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}