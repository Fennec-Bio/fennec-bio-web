import { DashboardTabs } from '@/components/Plate/DashboardTabs'
import { PlateExperimentList } from '@/components/Plate/PlateExperimentList'

export default function PlatesPage() {
  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-[1920px] mx-auto px-3 py-3 md:px-4 md:py-4 lg:px-6">
        <DashboardTabs />
        <PlateExperimentList />
      </div>
    </div>
  )
}
