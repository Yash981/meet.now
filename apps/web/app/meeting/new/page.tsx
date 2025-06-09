"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Video, Mic, Settings, Copy, Calendar, Clock, Users, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useState, useRef, useEffect } from "react"

export default function NewMeeting() {
  const [meetingTitle, setMeetingTitle] = useState("")
  const [isInstantMeeting, setIsInstantMeeting] = useState(true)
  const [enableRecording, setEnableRecording] = useState(true)
  const [enableWaitingRoom, setEnableWaitingRoom] = useState(false)
  const [isCameraOn, setIsCameraOn] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const meetingId = "123-456-789"
  const meetingLink = `https://streamstudio.com/join/${meetingId}`

  const toggleCamera = async () => {
    if (isCameraOn) {
      // Turn off camera
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
      setIsCameraOn(false)
    } else {
      // Turn on camera
      try {
        console.log("Requesting camera access...")
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        })
        console.log("Camera access granted:", stream)
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          // Ensure video starts playing
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(err => {
              console.error("Error playing video:", err)
            })
          }
        } else {
          console.error("Video element reference is null")
        }
        setIsCameraOn(true)
      } catch (err) {
        console.error("Error accessing camera:", err)
        alert("Could not access camera. Please make sure you have granted camera permissions.")
      }
    }
  }

  // Cleanup camera stream when component unmounts
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center space-x-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                <Video className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold">StreamStudio</span>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Create New Meeting</h1>
          <p className="text-gray-600">Set up your meeting room and invite participants</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Meeting Setup */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Meeting Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="title">Meeting Title</Label>
                  <Input
                    id="title"
                    placeholder="Enter meeting title"
                    value={meetingTitle}
                    onChange={(e) => setMeetingTitle(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Textarea id="description" placeholder="Add meeting description or agenda" rows={3} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Instant Meeting</Label>
                    <p className="text-sm text-gray-600">Start meeting immediately</p>
                  </div>
                  <Switch checked={isInstantMeeting} onCheckedChange={setIsInstantMeeting} />
                </div>

                {!isInstantMeeting && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="date">Date</Label>
                      <Input id="date" type="date" />
                    </div>
                    <div>
                      <Label htmlFor="time">Time</Label>
                      <Input id="time" type="time" />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Meeting Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Recording</Label>
                    <p className="text-sm text-gray-600">Automatically record the meeting</p>
                  </div>
                  <Switch checked={enableRecording} onCheckedChange={setEnableRecording} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Waiting Room</Label>
                    <p className="text-sm text-gray-600">Participants wait for host approval</p>
                  </div>
                  <Switch checked={enableWaitingRoom} onCheckedChange={setEnableWaitingRoom} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Mute Participants on Entry</Label>
                    <p className="text-sm text-gray-600">Participants join muted</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Preview & Actions */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Meeting Preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="aspect-video bg-gradient-to-br from-purple-600/20 to-blue-600/20 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center relative">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover rounded-lg ${isCameraOn ? 'block' : 'hidden'}`}
                  />
                  {!isCameraOn && (
                    <div className="text-center absolute  flex items-center justify-center mx-auto">
                      <Video className=" text-gray-400 mr-2" />
                      <p className="text-gray-600">Camera preview will appear here</p>
                    </div>
                  )}
                </div>

                <div className="flex justify-center space-x-4">
                  <Button variant="outline" size="sm">
                    <Mic className="w-4 h-4 mr-2" />
                    Test Mic
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={toggleCamera}
                    className={isCameraOn ? "bg-red-100 hover:bg-red-200" : ""}
                  >
                    <Video className="w-4 h-4 mr-2" />
                    {isCameraOn ? "Turn Off Camera" : "Test Camera"}
                  </Button>
                  <Button variant="outline" size="sm">
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Meeting Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Meeting ID</Label>
                  <div className="flex items-center space-x-2">
                    <Input value={meetingId} readOnly />
                    <Button variant="outline" size="icon">
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Meeting Link</Label>
                  <div className="flex items-center space-x-2">
                    <Input value={meetingLink} readOnly className="text-sm" />
                    <Button variant="outline" size="icon">
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-4">
                  <div className="text-center">
                    <Calendar className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                    <p className="text-sm text-gray-600">{isInstantMeeting ? "Now" : "Scheduled"}</p>
                  </div>
                  <div className="text-center">
                    <Clock className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                    <p className="text-sm text-gray-600">No limit</p>
                  </div>
                  <div className="text-center">
                    <Users className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                    <p className="text-sm text-gray-600">Up to 8</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3">
              <Link href={`/meeting/${meetingId}`}>
                <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white" size="lg">
                  {isInstantMeeting ? "Start Meeting Now" : "Schedule Meeting"}
                </Button>
              </Link>

              <Button variant="outline" className="w-full" size="lg">
                <Copy className="w-4 h-4 mr-2" />
                Copy Invitation
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}