import { DashboardTabs } from '@/components/Plate/DashboardTabs'
import { CreatePlateExperiment } from '@/components/Plate/CreatePlateExperiment'

export default function NewPlateExperimentPage() {
  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-[1920px] mx-auto px-3 py-3 md:px-4 md:py-4 lg:px-6">
        <DashboardTabs />
        <div className="mx-auto max-w-2xl bg-white rounded-lg shadow p-6">
          <h1 className="mb-4 text-xl md:text-2xl font-bold text-gray-900">New plate experiment</h1>
          <CreatePlateExperiment />
        </div>
      </div>
    </div>
  )
}
