import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import CapsuleListPage from './pages/CapsuleListPage.jsx';
import CapsuleDetailPage from './pages/CapsuleDetailPage.jsx';
import CreateCapsulePage from './pages/CreateCapsulePage.jsx';

const router = createBrowserRouter([
	{
		path: '/',
		element: <Layout />,
		children: [
			{ index: true, element: <CapsuleListPage /> },
			{ path: 'capsules/:capsuleId', element: <CapsuleDetailPage /> },
			{ path: 'create', element: <CreateCapsulePage /> },
		],
	},
]);

function App() {
	return <RouterProvider router={router} />;
}

export default App;
